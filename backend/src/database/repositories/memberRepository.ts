import {
  ActivityDisplayVariant,
  FeatureFlag,
  IMemberIdentity,
  IMemberOrganization,
  IMemberUsername,
  MemberAttributeName,
  MemberAttributeType,
  MemberIdentityType,
  OpenSearchIndex,
  OrganizationSource,
  PageData,
  PlatformType,
  SegmentData,
  SegmentProjectGroupNestedData,
  SegmentProjectNestedData,
  SyncStatus,
} from '@crowd/types'
import lodash, { chunk } from 'lodash'
import moment from 'moment'
import Sequelize, { QueryTypes } from 'sequelize'

import {
  captureApiChange,
  memberCreateAction,
  memberEditOrganizationsAction,
  memberEditProfileAction,
} from '@crowd/audit-logs'
import { Error400, Error404, Error409, dateEqualityChecker, distinct } from '@crowd/common'
import {
  countMembersWithActivities,
  getActiveMembers,
  getLastActivitiesForMembers,
  getMemberAggregates,
  setMemberDataToActivities,
} from '@crowd/data-access-layer'
import {
  createMemberIdentity,
  deleteMemberIdentities,
  deleteMemberIdentitiesByCombinations,
  moveToNewMember,
  updateVerifiedFlag,
} from '@crowd/data-access-layer/src/member_identities'
import { ActivityDisplayService } from '@crowd/integrations'
import { FieldTranslatorFactory, OpensearchQueryParser } from '@crowd/opensearch'
import { KUBE_MODE, SERVICE } from '@/conf'
import { ServiceType } from '../../conf/configTypes'
import isFeatureEnabled from '../../feature-flags/isFeatureEnabled'
import { PlatformIdentities } from '../../serverless/integrations/types/messageTypes'
import {
  MemberSegmentAffiliation,
  MemberSegmentAffiliationJoined,
} from '../../types/memberSegmentAffiliationTypes'
import { AttributeData } from '../attributes/attribute'
import { IRepositoryOptions } from './IRepositoryOptions'
import AuditLogRepository from './auditLogRepository'
import MemberAttributeSettingsRepository from './memberAttributeSettingsRepository'
import MemberSegmentAffiliationRepository from './memberSegmentAffiliationRepository'
import MemberSyncRemoteRepository from './memberSyncRemoteRepository'
import OrganizationRepository from './organizationRepository'
import SegmentRepository from './segmentRepository'
import SequelizeRepository from './sequelizeRepository'
import TenantRepository from './tenantRepository'
import {
  IActiveMemberData,
  IActiveMemberFilter,
  IMemberMergeSuggestion,
  mapUsernameToIdentities,
} from './types/memberTypes'
import { IFetchMemberMergeSuggestionArgs, SimilarityScoreRange } from '@/types/mergeSuggestionTypes'

const { Op } = Sequelize

const log: boolean = false

interface ActivityAggregates {
  memberId: string
  segmentId: string
  activityCount: number
  activeDaysCount: number
  lastActive: string
  activityTypes: string[]
  activeOn: string[]
  averageSentiment: number
}

class MemberRepository {
  static async create(data, options: IRepositoryOptions, doPopulateRelations = true) {
    if (!data.username && !data.identities) {
      throw new Error('Username not set when creating member!')
    }

    const currentUser = SequelizeRepository.getCurrentUser(options)

    const tenant = SequelizeRepository.getCurrentTenant(options)

    const transaction = SequelizeRepository.getTransaction(options)

    const toInsert = {
      ...lodash.pick(data, [
        'id',
        'displayName',
        'attributes',
        'emails',
        'lastEnriched',
        'enrichedBy',
        'contributions',
        'score',
        'reach',
        'joinedAt',
        'manuallyCreated',
        'importHash',
      ]),
      tenantId: tenant.id,
      createdById: currentUser.id,
      updatedById: currentUser.id,
    }
    const record = await options.database.member.create(toInsert, {
      transaction,
    })

    await captureApiChange(
      options,
      memberCreateAction(record.id, async (captureNewState) => {
        captureNewState(toInsert)
      }),
    )

    const qx = SequelizeRepository.getQueryExecutor(options, transaction)

    if (data.identities) {
      for (const i of data.identities as IMemberIdentity[]) {
        await createMemberIdentity(qx, {
          memberId: record.id,
          tenantId: tenant.id,
          platform: i.platform,
          type: i.type,
          value: i.value,
          sourceId: i.sourceId || null,
          integrationId: i.integrationId || null,
          verified: i.verified,
        })
      }
    } else if (data.username) {
      const username: PlatformIdentities = mapUsernameToIdentities(data.username)

      for (const platform of Object.keys(username) as PlatformType[]) {
        const identities: any[] = username[platform]
        for (const identity of identities) {
          await createMemberIdentity(qx, {
            memberId: record.id,
            platform,
            value: identity.value ? identity.value : identity.username,
            type: identity.type ? identity.type : MemberIdentityType.USERNAME,
            verified: true,
            sourceId: identity.sourceId || null,
            integrationId: identity.integrationId || null,
            tenantId: tenant.id,
          })
        }
      }
    }

    await MemberRepository.includeMemberToSegments(record.id, options)

    await record.setActivities(data.activities || [], {
      transaction,
    })
    await record.setTags(data.tags || [], {
      transaction,
    })

    await MemberRepository.updateMemberOrganizations(record, data.organizations, true, options)

    await record.setTasks(data.tasks || [], {
      transaction,
    })

    await record.setNotes(data.notes || [], {
      transaction,
    })

    await record.setNoMerge(data.noMerge || [], {
      transaction,
    })
    await record.setToMerge(data.toMerge || [], {
      transaction,
    })

    if (data.affiliations) {
      await this.setAffiliations(record.id, data.affiliations, options)
    }

    await this._createAuditLog(AuditLogRepository.CREATE, record, data, options)

    return this.findById(record.id, options, true, doPopulateRelations)
  }

  static async includeMemberToSegments(memberId: string, options: IRepositoryOptions) {
    const seq = SequelizeRepository.getSequelize(options)

    const transaction = SequelizeRepository.getTransaction(options)

    let bulkInsertMemberSegments = `INSERT INTO "memberSegments" ("memberId","segmentId", "tenantId", "createdAt") VALUES `
    const replacements = {
      memberId,
      tenantId: options.currentTenant.id,
    }

    for (let idx = 0; idx < options.currentSegments.length; idx++) {
      bulkInsertMemberSegments += ` (:memberId, :segmentId${idx}, :tenantId, now()) `

      replacements[`segmentId${idx}`] = options.currentSegments[idx].id

      if (idx !== options.currentSegments.length - 1) {
        bulkInsertMemberSegments += `,`
      }
    }

    bulkInsertMemberSegments += ` ON CONFLICT DO NOTHING`

    await seq.query(bulkInsertMemberSegments, {
      replacements,
      type: QueryTypes.INSERT,
      transaction,
    })
  }

  static async excludeMembersFromSegments(memberIds: string[], options: IRepositoryOptions) {
    const seq = SequelizeRepository.getSequelize(options)

    const transaction = SequelizeRepository.getTransaction(options)

    const bulkDeleteMemberSegments = `DELETE FROM "memberSegments" WHERE "memberId" in (:memberIds) and "segmentId" in (:segmentIds);`

    await seq.query(bulkDeleteMemberSegments, {
      replacements: {
        memberIds,
        segmentIds: SequelizeRepository.getSegmentIds(options),
      },
      type: QueryTypes.DELETE,
      transaction,
    })
  }

  static async findSampleDataMemberIds(options: IRepositoryOptions) {
    const transaction = SequelizeRepository.getTransaction(options)
    const currentTenant = SequelizeRepository.getCurrentTenant(options)
    const sampleMemberIds = await options.database.sequelize.query(
      `select m.id from members m
      where (m.attributes->'sample'->'default')::boolean is true
      and m."tenantId" = :tenantId;
    `,
      {
        replacements: {
          tenantId: currentTenant.id,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    )

    return sampleMemberIds.map((i) => i.id)
  }

  static async countMemberMergeSuggestions(
    memberFilter: string,
    similarityFilter: string,
    displayNameFilter: string,
    replacements: {
      segmentIds: string[]
      memberId?: string
      displayName?: string
    },
    options: IRepositoryOptions,
  ): Promise<number> {
    // TODO questdb
    const totalCount = await options.database.sequelize.query(
      `
        SELECT
            COUNT(DISTINCT mtm."memberId"::TEXT || mtm."toMergeId"::TEXT) AS count
        FROM "memberToMerge" mtm
        JOIN member_segments_mv ms ON ms."memberId" = mtm."memberId"
        JOIN member_segments_mv ms2 ON ms2."memberId" = mtm."toMergeId"
        join members m on m.id = mtm."memberId"
        join members m2 on m2.id = mtm."toMergeId"
        WHERE ms."segmentId" IN (:segmentIds) and ms2."segmentId" IN (:segmentIds)
          ${memberFilter}
          ${similarityFilter}
          ${displayNameFilter}
      `,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    )

    return totalCount[0]?.count || 0
  }

  static async findMembersWithMergeSuggestions(
    args: IFetchMemberMergeSuggestionArgs,
    options: IRepositoryOptions,
  ) {
    let segmentIds: string[]

    const HIGH_CONFIDENCE_LOWER_BOUND = 0.9
    const MEDIUM_CONFIDENCE_LOWER_BOUND = 0.7

    if (args.filter?.projectIds) {
      segmentIds = (
        await new SegmentRepository(options).getSegmentSubprojects(args.filter.projectIds)
      ).map((s) => s.id)
    } else if (args.filter?.subprojectIds) {
      segmentIds = args.filter.subprojectIds
    } else {
      segmentIds = SequelizeRepository.getSegmentIds(options)
    }

    let similarityFilter = ''
    const similarityConditions = []

    for (const similarity of args.filter?.similarity || []) {
      if (similarity === SimilarityScoreRange.HIGH) {
        similarityConditions.push(`(mtm.similarity >= ${HIGH_CONFIDENCE_LOWER_BOUND})`)
      } else if (similarity === SimilarityScoreRange.MEDIUM) {
        similarityConditions.push(
          `(mtm.similarity >= ${MEDIUM_CONFIDENCE_LOWER_BOUND} and mtm.similarity < ${HIGH_CONFIDENCE_LOWER_BOUND})`,
        )
      } else if (similarity === SimilarityScoreRange.LOW) {
        similarityConditions.push(`(mtm.similarity < ${MEDIUM_CONFIDENCE_LOWER_BOUND})`)
      }
    }

    if (similarityConditions.length > 0) {
      similarityFilter = ` and (${similarityConditions.join(' or ')})`
    }

    const memberFilter = args.filter?.memberId
      ? ` and (mtm."memberId" = :memberId OR mtm."toMergeId" = :memberId)`
      : ''

    const displayNameFilter = args.filter?.displayName
      ? ` and (m."displayName" ilike :displayName OR m2."displayName" ilike :displayName)`
      : ''

    let order = 'mtm."activityEstimate" desc, mtm.similarity desc, mtm."memberId", mtm."toMergeId"'

    if (args.orderBy?.length > 0) {
      order = ''
      for (const orderBy of args.orderBy) {
        const [field, direction] = orderBy.split('_')
        if (
          ['similarity', 'activityEstimate'].includes(field) &&
          ['asc', 'desc'].includes(direction.toLowerCase())
        ) {
          order += `mtm.${field} ${direction}, `
        }
      }

      order += 'mtm."memberId", mtm."toMergeId"'
    }

    if (args.countOnly) {
      const totalCount = await this.countMemberMergeSuggestions(
        memberFilter,
        similarityFilter,
        displayNameFilter,
        {
          segmentIds,
          displayName: args?.filter?.displayName ? `${args.filter.displayName}%` : undefined,
          memberId: args?.filter?.memberId,
        },
        options,
      )

      return { count: totalCount }
    }

    // TODO questdb
    const mems = await options.database.sequelize.query(
      `
        SELECT
            DISTINCT
            mtm."memberId" AS id,
            mtm."toMergeId",
            mtm.similarity,
            mtm."activityEstimate",
            m."displayName" as "primaryDisplayName",
            m.attributes->'avatarUrl'->>'default' as "primaryAvatarUrl",
            m2."displayName" as "toMergeDisplayName",
            m2.attributes->'avatarUrl'->>'default' as "toMergeAvatarUrl"
        FROM "memberToMerge" mtm
        JOIN member_segments_mv ms ON ms."memberId" = mtm."memberId"
        JOIN member_segments_mv ms2 ON ms2."memberId" = mtm."toMergeId"
        join members m on m.id = mtm."memberId"
        join members m2 on m2.id = mtm."toMergeId"
        WHERE ms."segmentId" IN (:segmentIds) and ms2."segmentId" IN (:segmentIds)
          ${memberFilter}
          ${similarityFilter}
          ${displayNameFilter}
        ORDER BY ${order}
        LIMIT :limit
        OFFSET :offset
      `,
      {
        replacements: {
          segmentIds,
          limit: args.limit,
          offset: args.offset,
          displayName: args?.filter?.displayName ? `${args.filter.displayName}%` : undefined,
          memberId: args?.filter?.memberId,
        },
        type: QueryTypes.SELECT,
      },
    )

    if (mems.length > 0) {
      let result

      if (args.detail) {
        const memberPromises = []
        const toMergePromises = []

        for (const mem of mems) {
          memberPromises.push(MemberRepository.findByIdOpensearch(mem.id, options))
          toMergePromises.push(MemberRepository.findByIdOpensearch(mem.toMergeId, options))
        }

        const memberResults = await Promise.all(memberPromises)
        const memberToMergeResults = await Promise.all(toMergePromises)

        result = memberResults.map((i, idx) => ({
          members: [i, memberToMergeResults[idx]],
          similarity: mems[idx].similarity,
        }))
      } else {
        result = mems.map((i) => ({
          members: [
            {
              id: i.id,
              displayName: i.primaryDisplayName,
              avatarUrl: i.primaryAvatarUrl,
            },
            {
              id: i.toMergeId,
              displayName: i.toMergeDisplayName,
              avatarUrl: i.toMergeAvatarUrl,
            },
          ],
          similarity: i.similarity,
        }))
      }

      const totalCount = await this.countMemberMergeSuggestions(
        memberFilter,
        similarityFilter,
        displayNameFilter,
        {
          segmentIds,
          memberId: args?.filter?.memberId,
          displayName: args?.filter?.displayName ? `${args.filter.displayName}%` : undefined,
        },
        options,
      )

      return { rows: result, count: totalCount, limit: args.limit, offset: args.offset }
    }

    return {
      rows: [{ members: [], similarity: 0 }],
      count: 0,
      limit: args.limit,
      offset: args.offset,
    }
  }

  static async moveIdentitiesBetweenMembers(
    fromMemberId: string,
    toMemberId: string,
    identitiesToMove: IMemberIdentity[],
    identitiesToUpdate: IMemberIdentity[],
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)
    const qx = SequelizeRepository.getQueryExecutor(options, transaction)

    const tenant = SequelizeRepository.getCurrentTenant(options)

    for (const i of identitiesToMove) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { rowCount } = await moveToNewMember(qx, {
        tenantId: tenant.id,
        oldMemberId: fromMemberId,
        newMemberId: toMemberId,
        platform: i.platform,
        value: i.value,
        type: i.type,
      })

      if (rowCount !== 1) {
        throw new Error('One row should be updated!')
      }
    }

    if (identitiesToUpdate.length > 0) {
      for (const i of identitiesToUpdate) {
        // first we remove them from the old member (we can't update and delete at the same time because of a unique index where only one identity can have a verified type:value combination for a tenant, member and platform)
        await deleteMemberIdentities(qx, {
          memberId: fromMemberId,
          platform: i.platform,
          value: i.value,
          type: i.type,
        })

        // then we update verified flag for the identities in the new member
        await updateVerifiedFlag(qx, {
          memberId: toMemberId,
          tenantId: tenant.id,
          platform: i.platform,
          value: i.value,
          type: i.type,
          verified: true,
        })
      }
    }
  }

  static async addToMerge(
    suggestions: IMemberMergeSuggestion[],
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)
    const seq = SequelizeRepository.getSequelize(options)

    // Remove possible duplicates
    suggestions = lodash.uniqWith(suggestions, (a, b) =>
      lodash.isEqual(lodash.sortBy(a.members), lodash.sortBy(b.members)),
    )

    // Process suggestions in chunks of 100 or less
    const suggestionChunks = chunk(suggestions, 100)

    const insertValues = (
      memberId: string,
      toMergeId: string,
      similarity: number | null,
      index: number,
    ) => {
      const idPlaceholder = (key: string) => `${key}${index}`
      return {
        query: `(:${idPlaceholder('memberId')}, :${idPlaceholder('toMergeId')}, :${idPlaceholder(
          'similarity',
        )}, NOW(), NOW())`,
        replacements: {
          [idPlaceholder('memberId')]: memberId,
          [idPlaceholder('toMergeId')]: toMergeId,
          [idPlaceholder('similarity')]: similarity === null ? null : similarity,
        },
      }
    }

    for (const suggestionChunk of suggestionChunks) {
      const placeholders: string[] = []
      let replacements: Record<string, unknown> = {}

      suggestionChunk.forEach((suggestion, index) => {
        const { query, replacements: chunkReplacements } = insertValues(
          suggestion.members[0],
          suggestion.members[1],
          suggestion.similarity,
          index,
        )
        placeholders.push(query)
        replacements = { ...replacements, ...chunkReplacements }
      })

      const query = `
        INSERT INTO "memberToMerge" ("memberId", "toMergeId", "similarity", "createdAt", "updatedAt")
        VALUES ${placeholders.join(', ')} on conflict do nothing;
      `
      try {
        await seq.query(query, {
          replacements,
          type: QueryTypes.INSERT,
          transaction,
        })
      } catch (error) {
        options.log.error('error adding members to merge', error)
        throw error
      }
    }
  }

  static async removeToMerge(id, toMergeId, options: IRepositoryOptions) {
    const transaction = SequelizeRepository.getTransaction(options)

    const returnPlain = false

    const member = await this.findById(id, options, returnPlain)

    const toMergeMember = await this.findById(toMergeId, options, returnPlain)

    await member.removeToMerge(toMergeMember, { transaction })

    return this.findById(id, options)
  }

  static async addNoMerge(id, toMergeId, options: IRepositoryOptions) {
    const transaction = SequelizeRepository.getTransaction(options)

    const returnPlain = false

    const member = await this.findById(id, options, returnPlain)

    const toMergeMember = await this.findById(toMergeId, options, returnPlain)

    await member.addNoMerge(toMergeMember, { transaction })

    return this.findById(id, options)
  }

  static async removeNoMerge(id, toMergeId, options: IRepositoryOptions) {
    const transaction = SequelizeRepository.getTransaction(options)

    const returnPlain = false

    const member = await this.findById(id, options, returnPlain)

    const toMergeMember = await this.findById(toMergeId, options, returnPlain)

    await member.removeNoMerge(toMergeMember, { transaction })

    return this.findById(id, options)
  }

  static async memberExists(
    username,
    platform,
    options: IRepositoryOptions,
    doPopulateRelations = true,
  ) {
    const transaction = SequelizeRepository.getTransaction(options)

    const currentTenant = SequelizeRepository.getCurrentTenant(options)

    const seq = SequelizeRepository.getSequelize(options)

    const usernames: string[] = []
    if (typeof username === 'string') {
      usernames.push(username)
    } else if (Array.isArray(username)) {
      usernames.push(...username)
    } else {
      throw new Error(
        'Unknown username format! Allowed formats are string or string[]. For example: "username" or ["username1", "username2"]',
      )
    }

    // first find the id - we don't need the other bloat
    const results = await seq.query(
      `
    select mi."memberId"
    from "memberIdentities" mi
    where mi."tenantId" = :tenantId and
          mi.platform = :platform and
          mi.type = :type and
          mi.value in (:usernames) and
          exists (select 1 from "memberSegments" ms where ms."memberId" = mi."memberId")
  `,
      {
        type: Sequelize.QueryTypes.SELECT,
        replacements: {
          tenantId: currentTenant.id,
          platform,
          usernames,
          type: MemberIdentityType.USERNAME,
        },
        transaction,
      },
    )

    const ids = results.map((r: any) => r.memberId)

    if (ids.length === 0) {
      return null
    }

    if (doPopulateRelations) {
      return this.findById(ids[0], options)
    }

    // the if needed actualy query the db for the rest by primary/foreign key which is much faster
    const records = await seq.query(
      `
      with segment_ids as (
        select "memberId", array_agg("segmentId") as "segmentIds" from
        "memberSegments"
        where "memberId" = :memberId
        group by "memberId"
      ),
      identities as (select mi."memberId",
                            array_agg(distinct mi.platform)             as identities,
                            jsonb_object_agg(mi.platform, mi.usernames) as username
                      from (select "memberId",
                                  platform,
                                  array_agg(username) as usernames
                            from (select "memberId",
                                        platform,
                                        value as username,
                                        "createdAt",
                                        row_number() over (partition by "memberId", platform order by "createdAt" desc) =
                                        1 as is_latest
                                  from "memberIdentities" where "memberId" = :memberId and type = '${MemberIdentityType.USERNAME}') sub
                            group by "memberId", platform) mi
                      group by mi."memberId"),
        member_organizations as (
          select
            "memberId",
            JSONB_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                  'id', "organizationId",
                  'memberOrganizations',
                  JSONB_BUILD_OBJECT(
                    'memberId', "memberId",
                    'organizationId', "organizationId",
                    'dateStart', "dateStart",
                    'dateEnd', "dateEnd",
                    'createdAt', "createdAt",
                    'updatedAt', "updatedAt",
                    'title', title,
                    'source', source
                  )
                )
            ) AS orgs
          from "memberOrganizations"
          where "memberId" = :memberId
            and "deletedAt" is null
          group by "memberId"
        )
        select m."id",
              m."displayName",
              m."attributes",
              m."emails",
              m."score",
              m."lastEnriched",
              m."enrichedBy",
              m."contributions",
              m."reach",
              m."joinedAt",
              m."importHash",
              m."createdAt",
              m."updatedAt",
              m."deletedAt",
              m."tenantId",
              m."createdById",
              m."updatedById",
              i.username,
              si."segmentIds" as segments,
              coalesce(mo.orgs, '[]'::JSONB) as "organizations"
        from members m
                inner join identities i on i."memberId" = m.id
                inner join segment_ids si on si."memberId" = m.id
                left join member_organizations mo on mo."memberId" = m.id
        where m.id = :memberId;`,
      {
        type: Sequelize.QueryTypes.SELECT,
        replacements: {
          memberId: ids[0],
        },
        transaction,
      },
    )

    if (records.length !== 1) {
      throw new Error('Invalid number of records found!')
    }

    return records[0]
  }

  static MEMBER_UPDATE_COLUMNS = [
    'displayName',
    'attributes',
    'emails',
    'contributions',
    'score',
    'reach',
    'joinedAt',
    'importHash',
    'tags',
    'website',
    'location',
    'github',
    'twitter',
    'linkedin',
    'crunchbase',
    'employees',
    'revenueRange',
    'isTeamOrganization',
    'employeeCountByCountry',
    'type',
    'ticker',
    'headline',
    'profiles',
    'naics',
    'industry',
    'founded',
    'size',
    'lastEnrichedAt',
    'affiliatedProfiles',
    'allSubsidiaries',
    'alternativeDomains',
    'alternativeNames',
    'averageEmployeeTenure',
    'averageTenureByLevel',
    'averageTenureByRole',
    'directSubsidiaries',
    'employeeChurnRate',
    'employeeCountByMonth',
    'employeeGrowthRate',
    'employeeCountByMonthByLevel',
    'employeeCountByMonthByRole',
    'gicsSector',
    'grossAdditionsByMonth',
    'grossDeparturesByMonth',
    'ultimateParent',
    'immediateParent',
    'attributes',
  ]

  static isEqual = {
    displayName: (a, b) => a === b,
    attributes: (a, b) => lodash.isEqual(a, b),
    emails: (a, b) => lodash.isEqual(a, b),
    lastEnriched: (a, b) => dateEqualityChecker(a, b),
    contributions: (a, b) => lodash.isEqual(a, b),
    score: (a, b) => a === b,
    reach: (a, b) => lodash.isEqual(a, b),
    joinedAt: (a, b) => dateEqualityChecker(a, b),
    importHash: (a, b) => a === b,
  }

  static async update(
    id,
    data,
    options: IRepositoryOptions,
    doPopulateRelations = true,
    manualChange = false,
  ) {
    const currentUser = SequelizeRepository.getCurrentUser(options)

    const transaction = SequelizeRepository.getTransaction(options)

    const currentTenant = SequelizeRepository.getCurrentTenant(options)

    const seq = SequelizeRepository.getSequelize(options)

    const record = await captureApiChange(
      options,
      memberEditProfileAction(id, async (captureOldState, captureNewState) => {
        const record = await options.database.member.findOne({
          where: {
            id,
            tenantId: currentTenant.id,
          },
          transaction,
        })

        captureOldState(record.get({ plain: true }))

        if (!record) {
          throw new Error404()
        }

        // exclude syncRemote attributes, since these are populated from memberSyncRemote table
        if (data.attributes?.syncRemote) {
          delete data.attributes.syncRemote
        }

        if (manualChange) {
          const manuallyChangedFields: string[] = record.manuallyChangedFields || []

          for (const column of this.MEMBER_UPDATE_COLUMNS) {
            let changed = false

            // only check fields that are in the data object that will be updated
            if (column in data) {
              if (
                record[column] !== null &&
                column in data &&
                (data[column] === null || data[column] === undefined)
              ) {
                // column was removed in the update -> will be set to null by sequelize
                changed = true
              } else if (
                record[column] === null &&
                data[column] !== null &&
                data[column] !== undefined
              ) {
                // column was null before now it's not anymore
                changed = true
              } else if (
                this.isEqual[column] &&
                this.isEqual[column](record[column], data[column]) === false
              ) {
                // column value has changed
                changed = true
              }
            }

            if (changed && !manuallyChangedFields.includes(column)) {
              // handle attributes, keep each changed attribute separately
              if (column === 'attributes') {
                for (const key of Object.keys(data.attributes)) {
                  if (!record.attributes[key]) {
                    manuallyChangedFields.push(`attributes.${key}`)
                  } else if (
                    !lodash.isEqual(record.attributes[key].default, data.attributes[key].default)
                  ) {
                    manuallyChangedFields.push(`attributes.${key}`)
                  }
                }
              } else {
                manuallyChangedFields.push(column)
              }
            }
          }

          data.manuallyChangedFields = manuallyChangedFields
        } else {
          // ignore columns that were manually changed
          // by rewriting them with db data
          const manuallyChangedFields: string[] = record.manuallyChangedFields || []
          for (const manuallyChangedColumn of manuallyChangedFields) {
            if (data.attributes && manuallyChangedColumn.startsWith('attributes')) {
              const attributeKey = manuallyChangedColumn.split('.')[1]
              data.attributes[attributeKey] = record.attributes[attributeKey]
            } else {
              data[manuallyChangedColumn] = record[manuallyChangedColumn]
            }
          }

          data.manuallyChangedFields = manuallyChangedFields
        }

        const updatedMember = {
          ...lodash.pick(data, this.MEMBER_UPDATE_COLUMNS),
          updatedById: currentUser.id,
          manuallyChangedFields: data.manuallyChangedFields,
        }

        await options.database.member.update(captureNewState(updatedMember), {
          where: {
            id: record.id,
          },
          transaction,
        })

        if (
          manualChange &&
          (data.attributes[MemberAttributeName.IS_BOT] ||
            data.attributes[MemberAttributeName.IS_TEAM_MEMBER])
        ) {
          await setMemberDataToActivities(options.qdb, record.id, {
            isBot: data.attributes[MemberAttributeName.IS_BOT]
              ? data.attributes[MemberAttributeName.IS_BOT].default
              : false,
            isTeamMember: data.attributes[MemberAttributeName.IS_TEAM_MEMBER]
              ? data.attributes[MemberAttributeName.IS_TEAM_MEMBER].default
              : false,
          })
        }

        return record
      }),
      !manualChange, // no need to track for audit if it's not a manual change
    )

    if (data.activities) {
      await record.setActivities(data.activities || [], {
        transaction,
      })
    }

    if (data.tags) {
      await record.setTags(data.tags || [], {
        transaction,
      })
    }

    if (data.tasks) {
      await record.setTasks(data.tasks || [], {
        transaction,
      })
    }

    if (data.notes) {
      await record.setNotes(data.notes || [], {
        transaction,
      })
    }

    await MemberRepository.updateMemberOrganizations(
      record,
      data.organizations,
      data.organizationsReplace,
      options,
    )

    if (data.noMerge) {
      await record.setNoMerge(data.noMerge || [], {
        transaction,
      })
    }

    if (data.toMerge) {
      await record.setToMerge(data.toMerge || [], {
        transaction,
      })
    }

    if (data.affiliations) {
      await MemberRepository.setAffiliations(id, data.affiliations, options)
    }

    if (options.currentSegments && options.currentSegments.length > 0) {
      await MemberRepository.includeMemberToSegments(record.id, options)
    }

    // Before upserting identities, check if they already exist
    const checkIdentities = [...(data.identitiesToCreate || []), ...(data.identitiesToUpdate || [])]
    if (checkIdentities.length > 0) {
      for (const i of checkIdentities) {
        const query = `
          select "memberId"
          from "memberIdentities"
          where "platform" = :platform and
                "value" = :value and
                "type" = :type and
                "tenantId" = :tenantId
        `

        const data: IMemberIdentity[] = await seq.query(query, {
          replacements: {
            platform: i.platform,
            value: i.value,
            type: i.type || MemberIdentityType.USERNAME,
            tenantId: currentTenant.id,
          },
          type: QueryTypes.SELECT,
          transaction,
        })

        if (data.length > 0 && data[0].memberId !== record.id) {
          const memberSegment = (await seq.query(
            `
            select distinct a."segmentId", a."memberId"
        from activities a where a."memberId" = :memberId
        limit 1
          `,
            {
              replacements: {
                memberId: data[0].memberId,
              },
              type: QueryTypes.SELECT,
              transaction,
            },
          )) as any[]

          const segmentInfo = (await seq.query(
            `
          select s.id, pd.id as "parentId", gpd.id as "grandParentId"
          from segments s
                  inner join segments pd
                              on pd."tenantId" = s."tenantId" and pd.slug = s."parentSlug" and pd."grandparentSlug" is null and
                                pd."parentSlug" is not null
                  inner join segments gpd on gpd."tenantId" = s."tenantId" and gpd.slug = s."grandparentSlug" and
                                              gpd."grandparentSlug" is null and gpd."parentSlug" is null
          where s.id = :segmentId;
          `,
            {
              replacements: {
                segmentId: memberSegment[0].segmentId,
              },
              type: QueryTypes.SELECT,
              transaction,
            },
          )) as any[]

          throw new Error409(
            options.language,
            'errors.alreadyExists',
            // @ts-ignore
            JSON.stringify({
              memberId: data[0].memberId,
              grandParentId: segmentInfo[0].grandParentId,
            }),
          )
        }
      }
    }

    const qx = SequelizeRepository.getQueryExecutor(options, transaction)

    if (data.identitiesToCreate && data.identitiesToCreate.length > 0) {
      for (const i of data.identitiesToCreate) {
        await createMemberIdentity(qx, {
          memberId: record.id,
          platform: i.platform,
          value: i.value,
          type: i.type ? i.type : MemberIdentityType.USERNAME,
          sourceId: i.sourceId || null,
          integrationId: i.integrationId || null,
          tenantId: currentTenant.id,
          verified: i.verified !== undefined ? i.verified : !!manualChange,
        })
      }
    }

    if (data.identitiesToUpdate && data.identitiesToUpdate.length > 0) {
      for (const i of data.identitiesToUpdate) {
        await updateVerifiedFlag(qx, {
          memberId: record.id,
          platform: i.platform,
          value: i.value,
          type: i.type ? i.type : MemberIdentityType.USERNAME,
          tenantId: currentTenant.id,
          verified: i.verified !== undefined ? i.verified : !!manualChange,
        })
      }
    }

    if (data.identitiesToDelete && data.identitiesToDelete.length > 0) {
      for (const i of data.identitiesToDelete) {
        await deleteMemberIdentities(qx, {
          memberId: record.id,
          platform: i.platform,
          value: i.value,
          type: i.type ? i.type : MemberIdentityType.USERNAME,
        })
      }
    }

    if (data.username) {
      data.username = mapUsernameToIdentities(data.username)

      const platforms = Object.keys(data.username) as PlatformType[]
      if (platforms.length > 0) {
        const platformsToDelete: string[] = []
        const valuesToDelete: string[] = []
        const typesToDelete: MemberIdentityType[] = []

        for (const platform of platforms) {
          const identities = data.username[platform]

          for (const identity of identities) {
            if (identity.delete) {
              platformsToDelete.push(identity.platform)
              if (identity.value) {
                valuesToDelete.push(identity.value)
                typesToDelete.push(identity.type)
              } else {
                valuesToDelete.push(identity.username)
                typesToDelete.push(MemberIdentityType.USERNAME)
              }
            } else if (
              (identity.username && identity.username !== '') ||
              (identity.value && identity.value !== '')
            ) {
              await createMemberIdentity(qx, {
                memberId: record.id,
                platform,
                value: identity.value ? identity.value : identity.username,
                type: identity.type ? identity.type : MemberIdentityType.USERNAME,
                sourceId: identity.sourceId || null,
                integrationId: identity.integrationId || null,
                tenantId: currentTenant.id,
                verified: identity.verified !== undefined ? identity.verified : !!manualChange,
              })
            }
          }
        }

        if (platformsToDelete.length > 0) {
          await deleteMemberIdentitiesByCombinations(qx, {
            tenantId: currentTenant.id,
            memberId: record.id,
            platforms: platformsToDelete,
            values: valuesToDelete,
            types: typesToDelete,
          })
        }
      }
    }

    await this._createAuditLog(AuditLogRepository.UPDATE, record, data, options)

    return this.findById(record.id, options, true, doPopulateRelations)
  }

  static async destroy(id, options: IRepositoryOptions, force = false) {
    const transaction = SequelizeRepository.getTransaction(options)

    const currentTenant = SequelizeRepository.getCurrentTenant(options)

    await MemberRepository.excludeMembersFromSegments([id], { ...options, transaction })
    const member = await this.findById(id, options, true, false)

    // if member doesn't belong to any other segment anymore, remove it
    if (member.segments.length === 0) {
      const record = await options.database.member.findOne({
        where: {
          id,
          tenantId: currentTenant.id,
        },
        transaction,
      })

      if (!record) {
        throw new Error404()
      }

      await record.destroy({
        force,
        transaction,
      })
      await this._createAuditLog(AuditLogRepository.DELETE, record, record, options)
    }
  }

  static async destroyBulk(ids, options: IRepositoryOptions, force = false) {
    const transaction = SequelizeRepository.getTransaction(options)

    const currentTenant = SequelizeRepository.getCurrentTenant(options)

    await MemberRepository.excludeMembersFromSegments(ids, { ...options, transaction })
    await options.database.member.destroy({
      where: {
        id: ids,
        tenantId: currentTenant.id,
      },
      force,
      transaction,
    })
  }

  static async getMemberSegments(
    memberId: string,
    options: IRepositoryOptions,
  ): Promise<SegmentData[]> {
    const transaction = SequelizeRepository.getTransaction(options)
    const seq = SequelizeRepository.getSequelize(options)
    const segmentRepository = new SegmentRepository(options)

    const query = `
        SELECT "segmentId"
        FROM "memberSegments"
        WHERE "memberId" = :memberId
        ORDER BY "createdAt";
    `

    const data = await seq.query(query, {
      replacements: {
        memberId,
      },
      type: QueryTypes.SELECT,
      transaction,
    })

    const segmentIds = (data as any[]).map((item) => item.segmentId)
    const segments = await segmentRepository.findInIds(segmentIds)

    return segments
  }

  static async getActivityAggregates(
    memberId: string,
    options: IRepositoryOptions,
    segmentId?: string,
  ): Promise<ActivityAggregates> {
    const transaction = SequelizeRepository.getTransaction(options)
    const seq = SequelizeRepository.getSequelize(options)
    const currentTenant = SequelizeRepository.getCurrentTenant(options)

    if (segmentId) {
      // we load data for a specific segment (can be leaf, parent or grand parent id)
      const dataFromOpensearch = (
        await this.findAndCountAllOpensearch(
          {
            filter: {
              and: [
                {
                  id: {
                    eq: memberId,
                  },
                },
              ],
            },
            limit: 1,
            offset: 0,
            segments: [segmentId],
          },
          options,
        )
      ).rows[0]

      return {
        activeDaysCount: dataFromOpensearch?.activeDaysCount || 0,
        activityCount: dataFromOpensearch?.activityCount || 0,
        activityTypes: dataFromOpensearch?.activityTypes || [],
        activeOn: dataFromOpensearch?.activeOn || [],
        averageSentiment: dataFromOpensearch?.averageSentiment || 0,
        lastActive: dataFromOpensearch?.lastActive || null,
        memberId,
        segmentId,
      }
    }

    const segmentIds = (
      await seq.query(
        `
      select id from segments where "tenantId" = :tenantId and "parentSlug" is not null and "grandparentSlug" is not null
    `,
        {
          replacements: {
            tenantId: currentTenant.id,
          },
          type: QueryTypes.SELECT,
          transaction,
        },
      )
    ).map((r: any) => r.id)

    const results = await getMemberAggregates(options.qdb, memberId, segmentIds)

    if (results.length > 0) {
      return results[0]
    }

    return null
  }

  static async setAffiliations(
    memberId: string,
    data: MemberSegmentAffiliation[],
    options: IRepositoryOptions,
  ): Promise<void> {
    const affiliationRepository = new MemberSegmentAffiliationRepository(options)
    await affiliationRepository.setForMember(memberId, data)
  }

  static async getAffiliations(
    memberId: string,
    options: IRepositoryOptions,
  ): Promise<MemberSegmentAffiliationJoined[]> {
    const transaction = SequelizeRepository.getTransaction(options)
    const seq = SequelizeRepository.getSequelize(options)

    const query = `
      select
        msa.id,
        s.id as "segmentId",
        s.slug as "segmentSlug",
        s.name as "segmentName",
        s."parentName" as "segmentParentName",
        o.id as "organizationId",
        o."displayName" as "organizationName",
        o.logo as "organizationLogo",
        msa."dateStart" as "dateStart",
        msa."dateEnd" as "dateEnd"
      from "memberSegmentAffiliations" msa
      left join organizations o on o.id = msa."organizationId"
      join segments s on s.id = msa."segmentId"
      where msa."memberId" = :memberId
    `

    const data = await seq.query(query, {
      replacements: {
        memberId,
      },
      type: QueryTypes.SELECT,
      transaction,
    })

    return data as MemberSegmentAffiliationJoined[]
  }

  static async getIdentities(
    memberIds: string[],
    options: IRepositoryOptions,
  ): Promise<Map<string, IMemberIdentity[]>> {
    const results = new Map<string, IMemberIdentity[]>()

    const transaction = SequelizeRepository.getTransaction(options)
    const seq = SequelizeRepository.getSequelize(options)

    const query = `
      select "memberId",
             platform,
             value,
             type,
             verified,
             "sourceId",
             "tenantId",
             "integrationId",
             "createdAt",
             "updatedAt"
      from "memberIdentities" 
      where "memberId" in (:memberIds)
      order by "createdAt" asc;
    `

    const data = await seq.query(query, {
      replacements: {
        memberIds,
      },
      type: QueryTypes.SELECT,
      transaction,
    })

    for (const id of memberIds) {
      results.set(id, [])
    }

    for (const res of data as any[]) {
      const { memberId, platform, value, type, sourceId, integrationId, createdAt, verified } = res
      const identities = results.get(memberId)

      identities.push({
        platform,
        value,
        type,
        sourceId,
        integrationId,
        createdAt,
        verified,
      })
    }

    return results
  }

  static async findById(
    id,
    options: IRepositoryOptions,
    returnPlain = true,
    doPopulateRelations = true,
    ignoreTenant = false,
    segmentId?: string,
    newIdentities?: boolean,
  ) {
    const transaction = SequelizeRepository.getTransaction(options)

    const include = [
      {
        model: options.database.organization,
        attributes: ['id', 'displayName'],
        as: 'organizations',
        order: [['createdAt', 'ASC']],
        through: {
          attributes: ['memberId', 'organizationId', 'dateStart', 'dateEnd', 'title', 'source'],
          where: {
            deletedAt: null,
          },
        },
      },
      {
        model: options.database.segment,
        as: 'segments',
        through: {
          attributes: [],
        },
      },
    ]

    const where: any = {
      id,
    }

    if (!ignoreTenant) {
      const currentTenant = SequelizeRepository.getCurrentTenant(options)
      where.tenantId = currentTenant.id
    }

    const record = await options.database.member.findOne({
      where,
      include,
      transaction,
    })

    if (!record) {
      throw new Error404()
    }

    if (doPopulateRelations) {
      return this._populateRelations(record, options, returnPlain, segmentId, newIdentities)
    }
    const data = record.get({ plain: returnPlain })

    MemberRepository.sortOrganizations(data.organizations)

    const identities = (await this.getIdentities([data.id], options)).get(data.id)

    data.username = MemberRepository.getUsernameFromIdentities(identities)

    data.affiliations = await MemberRepository.getAffiliations(id, options)

    return data
  }

  static getUsernameFromIdentities(identities: IMemberIdentity[]): IMemberUsername {
    const username = {}
    for (const identity of identities.filter((i) => i.type === MemberIdentityType.USERNAME)) {
      if (username[identity.platform]) {
        username[identity.platform].push(identity.value)
      } else {
        username[identity.platform] = [identity.value]
      }
    }

    return username
  }

  static async filterIdInTenant(id, options: IRepositoryOptions) {
    return lodash.get(await this.filterIdsInTenant([id], options), '[0]', null)
  }

  static async filterIdsInTenant(ids, options: IRepositoryOptions) {
    if (!ids || !ids.length) {
      return []
    }

    const transaction = SequelizeRepository.getTransaction(options)

    const currentTenant = SequelizeRepository.getCurrentTenant(options)

    const where = {
      id: {
        [Op.in]: ids,
      },
      tenantId: currentTenant.id,
    }

    const records = await options.database.member.findAll({
      attributes: ['id'],
      where,
      transaction,
    })

    return records.map((record) => record.id)
  }

  static async count(filter, options: IRepositoryOptions) {
    const transaction = SequelizeRepository.getTransaction(options)

    const tenant = SequelizeRepository.getCurrentTenant(options)

    return options.database.member.count({
      where: {
        ...filter,
        tenantId: tenant.id,
      },
      transaction,
    })
  }

  static async findByIdOpensearch(id, options: IRepositoryOptions, segmentId?: string) {
    const segments = segmentId ? [segmentId] : SequelizeRepository.getSegmentIds(options)

    const memberAttributeSettings = (
      await MemberAttributeSettingsRepository.findAndCountAll({}, options)
    ).rows

    const memberSearchQuery = {
      filter: {
        and: [
          {
            id: {
              eq: id,
            },
          },
        ],
      },
      limit: 1,
      offset: 0,
      attributesSettings: memberAttributeSettings,
    }

    let response = await this.findAndCountAllOpensearch(
      {
        ...memberSearchQuery,
        segments,
      },
      options,
    )

    // if not found, try to find it in all segments and return the first one
    if (response.count === 0) {
      response = await this.findAndCountAllOpensearch(memberSearchQuery, options)

      // still not found, throw 404
      if (response.count === 0) {
        throw new Error404()
      }
    }

    const result = response.rows[0]

    // Get special attributes from memberAttributeSettings
    const specialAttributes = memberAttributeSettings
      .filter((setting) => setting.type === 'special')
      .map((setting) => setting.name)

    // Parse special attributes that are indexed as strings
    if (result.attributes) {
      specialAttributes.forEach((attr) => {
        if (result.attributes[attr]) {
          result.attributes[attr] = JSON.parse(result.attributes[attr])
        }
      })
    }

    // Sort the organizations based on dateStart
    if (result.organizations) {
      result.organizations.sort((a, b) => {
        const dateStartA = a.memberOrganizations.dateStart
        const dateStartB = b.memberOrganizations.dateStart

        if (!dateStartA && !dateStartB) {
          return 0
        }

        if (!dateStartA) {
          return 1
        }

        if (!dateStartB) {
          return -1
        }

        return new Date(dateStartB).getTime() - new Date(dateStartA).getTime()
      })
    }

    const seq = SequelizeRepository.getSequelize(options)
    result.segments = await seq.query(
      `
      SELECT
          s.id,
          s.name
      FROM mv_activities_cube a
      JOIN segments s ON s.id = a."segmentId"
      WHERE a."memberId" = :id
      GROUP BY s.id
      `,
      {
        replacements: {
          id,
        },
        type: QueryTypes.SELECT,
      },
    )

    return result
  }

  static async findAndCountActiveOpensearch(
    filter: IActiveMemberFilter,
    limit: number,
    offset: number,
    orderBy: string,
    options: IRepositoryOptions,
    attributesSettings = [] as AttributeData[],
    segments: string[] = [],
  ): Promise<PageData<IActiveMemberData>> {
    const tenant = SequelizeRepository.getCurrentTenant(options)

    const segmentsEnabled = await isFeatureEnabled(FeatureFlag.SEGMENTS, options)

    let originalSegment

    if (segmentsEnabled) {
      if (segments.length !== 1) {
        throw new Error400(
          `This operation can have exactly one segment. Found ${segments.length} segments.`,
        )
      }
      originalSegment = segments[0]

      const segmentRepository = new SegmentRepository(options)

      const segment = await segmentRepository.findById(originalSegment)

      if (segment === null) {
        return {
          rows: [],
          count: 0,
          limit,
          offset,
        }
      }

      if (SegmentRepository.isProjectGroup(segment)) {
        segments = (segment as SegmentProjectGroupNestedData).projects.reduce((acc, p) => {
          acc.push(...p.subprojects.map((sp) => sp.id))
          return acc
        }, [])
      } else if (SegmentRepository.isProject(segment)) {
        segments = (segment as SegmentProjectNestedData).subprojects.map((sp) => sp.id)
      } else {
        segments = [originalSegment]
      }
    } else {
      originalSegment = (await new SegmentRepository(options).getDefaultSegment()).id
    }

    const activeMemberResults = await getActiveMembers(options.qdb, {
      timestampFrom: filter.activityTimestampFrom,
      timestampTo: filter.activityTimestampTo,
      isContribution: filter.activityIsContribution === true ? true : undefined,
      platforms: filter.platforms ? filter.platforms : undefined,
      segmentIds: segments,
      tenantId: tenant.id,
      limit: 10000,
      offset: 0,
      orderBy: orderBy.startsWith('activityCount') ? 'activityCount' : 'activeDaysCount',
      orderByDirection: orderBy.split('_')[1].toLowerCase() === 'desc' ? 'desc' : 'asc',
    })

    const memberIds = []
    const memberMap = {}

    for (const res of activeMemberResults) {
      memberIds.push(res.memberId)
      memberMap[res.memberId] = {
        activityCount: res.activityCount,
        activeDaysCount: res.activeDaysCount,
      }
    }

    if (memberIds.length === 0) {
      return {
        rows: [],
        count: 0,
        limit,
        offset,
      }
    }

    const memberQueryPayload = {
      and: [
        {
          id: {
            in: memberIds,
          },
        },
      ],
    } as any

    if (filter.isBot === true) {
      memberQueryPayload.and.push({
        isBot: {
          eq: true,
        },
      })
    } else if (filter.isBot === false) {
      memberQueryPayload.and.push({
        isBot: {
          not: true,
        },
      })
    }

    if (filter.isTeamMember === true) {
      memberQueryPayload.and.push({
        isTeamMember: {
          eq: true,
        },
      })
    } else if (filter.isTeamMember === false) {
      memberQueryPayload.and.push({
        isTeamMember: {
          not: true,
        },
      })
    }

    if (filter.isOrganization === true) {
      memberQueryPayload.and.push({
        isOrganization: {
          eq: true,
        },
      })
    } else if (filter.isOrganization === false) {
      memberQueryPayload.and.push({
        isOrganization: {
          not: true,
        },
      })
    }

    // to retain the sort came from activity query
    const customSortFunction = {
      _script: {
        type: 'number',
        script: {
          lang: 'painless',
          source: `
              def memberId = doc['uuid_memberId'].value;
              return params.memberIds.indexOf(memberId);
            `,
          params: {
            memberIds: memberIds.map((i) => `${i}`),
          },
        },
        order: 'asc',
      },
    }

    const members = await this.findAndCountAllOpensearch(
      {
        filter: memberQueryPayload,
        attributesSettings,
        segments: [originalSegment],
        countOnly: false,
        limit,
        offset,
        customSortFunction,
      },
      options,
    )

    return {
      rows: members.rows.map((m) => {
        m.activityCount = memberMap[m.id].activityCount.value
        m.activeDaysCount = memberMap[m.id].activeDaysCount.value
        return m
      }),
      count: members.count,
      offset,
      limit,
    }
  }

  static async countMembersPerSegment(options: IRepositoryOptions, segmentIds: string[]) {
    const countResults = await countMembersWithActivities(options.qdb, segmentIds)
    return countResults.reduce((acc, curr: any) => {
      acc[curr.segmentId] = parseInt(curr.totalCount, 10)
      return acc
    }, {})
  }

  static async findAndCountAllOpensearch(
    {
      filter = {} as any,
      limit = 20,
      offset = 0,
      orderBy = 'joinedAt_DESC',
      countOnly = false,
      attributesSettings = [] as AttributeData[],
      segments = [] as string[],
      customSortFunction = undefined,
    },
    options: IRepositoryOptions,
  ): Promise<PageData<any>> {
    const tenant = SequelizeRepository.getCurrentTenant(options)

    const segmentsEnabled = await isFeatureEnabled(FeatureFlag.SEGMENTS, options)

    const segment = segments[0]

    const translator = FieldTranslatorFactory.getTranslator(
      OpenSearchIndex.MEMBERS,
      attributesSettings,
      [
        'default',
        'custom',
        'crowd',
        'enrichment',
        ...(await TenantRepository.getAvailablePlatforms(options.currentTenant.id, options)).map(
          (p) => p.platform,
        ),
      ],
    )

    const parsed = OpensearchQueryParser.parse(
      { filter, limit, offset, orderBy },
      OpenSearchIndex.MEMBERS,
      translator,
    )

    // add tenant filter to parsed query
    parsed.query.bool.must.push({
      term: {
        uuid_tenantId: tenant.id,
      },
    })

    if (segmentsEnabled && segment) {
      // add segment filter
      parsed.query.bool.must.push({
        term: {
          uuid_segmentId: segment,
        },
      })
    }

    if (customSortFunction) {
      parsed.sort = customSortFunction
    }

    if (filter.organizations && filter.organizations.length > 0) {
      parsed.query.bool.must = parsed.query.bool.must.filter(
        (d) => d.nested?.query?.term?.['nested_organizations.uuid_id'] === undefined,
      )

      // add organizations filter manually for now

      for (const organizationId of filter.organizations) {
        parsed.query.bool.must.push({
          nested: {
            path: 'nested_organizations',
            query: {
              bool: {
                must: [
                  {
                    term: {
                      'nested_organizations.uuid_id': organizationId,
                    },
                  },
                  {
                    bool: {
                      must_not: {
                        exists: {
                          field: 'nested_organizations.obj_memberOrganizations.date_dateEnd',
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        })
      }
    }

    const countResponse = await options.opensearch.count({
      index: OpenSearchIndex.MEMBERS,
      body: { query: parsed.query },
    })

    if (countOnly) {
      return {
        rows: [],
        count: countResponse.body.count,
        limit,
        offset,
      }
    }

    const response = await options.opensearch.search({
      index: OpenSearchIndex.MEMBERS,
      body: parsed,
    })

    const translatedRows = response.body.hits.hits.map((o) =>
      translator.translateObjectToCrowd(o._source),
    )

    for (const row of translatedRows) {
      row.activeDaysCount = parseInt(row.activeDaysCount, 10)
      row.activityCount = parseInt(row.activityCount, 10)
    }

    const memberIds = translatedRows.map((r) => r.id)
    if (memberIds.length > 0) {
      const lastActivities = await getLastActivitiesForMembers(options.qdb, tenant.id, memberIds)

      for (const row of translatedRows) {
        const r = row as any
        r.lastActivity = lastActivities.find((a) => (a as any).memberId === r.id)
        if (r.lastActivity) {
          r.lastActivity.display = ActivityDisplayService.getDisplayOptions(
            r.lastActivity,
            SegmentRepository.getActivityTypes(options),
            [ActivityDisplayVariant.SHORT, ActivityDisplayVariant.CHANNEL],
          )
        }
      }
    }

    return { rows: translatedRows, count: countResponse.body.count, limit, offset }
  }

  /**
   * Returns sequelize literals for dynamic member attributes.
   * @param memberAttributeSettings
   * @param options
   * @returns
   */
  static async getDynamicAttributesLiterals(
    memberAttributeSettings: AttributeData[],
    options: IRepositoryOptions,
  ) {
    // get possible platforms for a tenant
    const availableDynamicAttributePlatformKeys = [
      'default',
      'custom',
      ...(await TenantRepository.getAvailablePlatforms(options.currentTenant.id, options)).map(
        (p) => p.platform,
      ),
    ]

    const dynamicAttributesDefaultNestedFields = memberAttributeSettings.reduce(
      (acc, attribute) => {
        acc[attribute.name] = `attributes.${attribute.name}.default`
        return acc
      },
      {},
    )

    const dynamicAttributesPlatformNestedFields = memberAttributeSettings.reduce(
      (acc, attribute) => {
        for (const key of availableDynamicAttributePlatformKeys) {
          if (attribute.type === MemberAttributeType.NUMBER) {
            acc[`attributes.${attribute.name}.${key}`] = Sequelize.literal(
              `("member"."attributes"#>>'{${attribute.name},${key}}')::integer`,
            )
          } else if (attribute.type === MemberAttributeType.BOOLEAN) {
            acc[`attributes.${attribute.name}.${key}`] = Sequelize.literal(
              `("member"."attributes"#>>'{${attribute.name},${key}}')::boolean`,
            )
          } else if (attribute.type === MemberAttributeType.MULTI_SELECT) {
            acc[`attributes.${attribute.name}.${key}`] = Sequelize.literal(
              `ARRAY( SELECT jsonb_array_elements_text("member"."attributes"#>'{${attribute.name},${key}}'))`,
            )
          } else {
            acc[`attributes.${attribute.name}.${key}`] = Sequelize.literal(
              `"member"."attributes"#>>'{${attribute.name},${key}}'`,
            )
          }
        }
        return acc
      },
      {},
    )

    const dynamicAttributesProjection = memberAttributeSettings.reduce((acc, attribute) => {
      for (const key of availableDynamicAttributePlatformKeys) {
        if (key === 'default') {
          acc.push([
            Sequelize.literal(`"member"."attributes"#>>'{${attribute.name},default}'`),
            attribute.name,
          ])
        } else {
          acc.push([
            Sequelize.literal(`"member"."attributes"#>>'{${attribute.name},${key}}'`),
            `${attribute.name}.${key}`,
          ])
        }
      }
      return acc
    }, [])

    return {
      dynamicAttributesDefaultNestedFields,
      dynamicAttributesPlatformNestedFields,
      availableDynamicAttributePlatformKeys,
      dynamicAttributesProjection,
    }
  }

  static async findAllAutocomplete(query, limit, options: IRepositoryOptions) {
    const tenant = SequelizeRepository.getCurrentTenant(options)

    const whereAnd: Array<any> = [
      {
        tenantId: tenant.id,
      },
    ]

    if (query) {
      whereAnd.push({
        [Op.or]: [
          {
            displayName: {
              [Op.iLike]: `${query}%`,
            },
          },
        ],
      })
    }

    const where = { [Op.and]: whereAnd }

    const records = await options.database.member.findAll({
      attributes: ['id', 'displayName', 'attributes'],
      where,
      limit: limit ? Number(limit) : undefined,
      order: [['displayName', 'ASC']],
      include: [
        {
          model: options.database.organization,
          attributes: ['id', 'displayName'],
          as: 'organizations',
        },
        {
          model: options.database.segment,
          as: 'segments',
          where: {
            id: SequelizeRepository.getSegmentIds(options),
          },
        },
      ],
    })

    return records.map((record) => ({
      id: record.id,
      label: record.displayName,
      avatar: record.attributes?.avatarUrl?.default || null,
      organizations: record.organizations.map((org) => ({
        id: org.id,
        name: org.name,
      })),
    }))
  }

  static async addAsUnverifiedIdentity(
    memberIds: string[],
    value: string,
    type: MemberIdentityType,
    platform: string,
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)

    const seq = SequelizeRepository.getSequelize(options)

    const tenant = SequelizeRepository.getCurrentTenant(options)

    const query = `
      insert into "memberIdentities"("memberId", platform, type, value, "tenantId", verified)
      values(:memberId, :platform, :type, :value, :tenantId, false)
      on conflict do nothing;
    `

    for (const memberId of memberIds) {
      await seq.query(query, {
        replacements: {
          memberId,
          value,
          type,
          platform,
          tenantId: tenant.id,
        },
        type: QueryTypes.INSERT,
        transaction,
      })
    }
  }

  static async _createAuditLog(action, record, data, options: IRepositoryOptions) {
    if (log) {
      let values = {}

      if (data) {
        values = {
          ...record.get({ plain: true }),
          activitiesIds: data.activities,
          tagsIds: data.tags,
          noMergeIds: data.noMerge,
        }
      }

      await AuditLogRepository.log(
        {
          entityName: 'member',
          entityId: record.id,
          action,
          values,
        },
        options,
      )
    }
  }

  static async _populateRelationsForRows(rows, attributesSettings, exportMode = false) {
    if (!rows) {
      return rows
    }

    // No need for lazyloading tags for integrations or microservices
    if (
      (KUBE_MODE &&
        (SERVICE === ServiceType.NODEJS_WORKER || SERVICE === ServiceType.JOB_GENERATOR) &&
        !exportMode) ||
      process.env.SERVICE === 'integrations' ||
      process.env.SERVICE === 'microservices-nodejs'
    ) {
      return rows.map((record) => {
        const plainRecord = record.get({ plain: true })
        plainRecord.noMerge = plainRecord.noMergeIds ? plainRecord.noMergeIds.split(',') : []
        plainRecord.toMerge = plainRecord.toMergeIds ? plainRecord.toMergeIds.split(',') : []

        delete plainRecord.toMergeIds
        delete plainRecord.noMergeIds
        return plainRecord
      })
    }

    return Promise.all(
      rows.map(async (record) => {
        const plainRecord = record.get({ plain: true })
        plainRecord.noMerge = plainRecord.noMergeIds ? plainRecord.noMergeIds.split(',') : []
        plainRecord.toMerge = plainRecord.toMergeIds ? plainRecord.toMergeIds.split(',') : []
        plainRecord.lastActivity = plainRecord.lastActive
          ? (
              await record.getActivities({
                order: [['timestamp', 'DESC']],
                limit: 1,
              })
            )[0].get({ plain: true })
          : null
        delete plainRecord.toMergeIds
        delete plainRecord.noMergeIds

        plainRecord.activeOn = plainRecord.activeOn ?? []

        for (const attribute of attributesSettings) {
          if (Object.prototype.hasOwnProperty.call(plainRecord, attribute.name)) {
            delete plainRecord[attribute.name]
          }
        }

        for (const attributeName in plainRecord.attributes) {
          if (!lodash.find(attributesSettings, { name: attributeName })) {
            delete plainRecord.attributes[attributeName]
          }
        }

        delete plainRecord.contributions

        delete plainRecord.company
        plainRecord.organizations = await record.getOrganizations({
          joinTableAttributes: [],
        })
        plainRecord.tags = await record.getTags({
          joinTableAttributes: [],
        })

        if (exportMode) {
          plainRecord.notes = await record.getNotes({
            joinTableAttributes: [],
          })
        }
        return plainRecord
      }),
    )
  }

  /**
   * Fill a record with the relations and files (if any)
   * @param record Record to get relations and files for
   * @param options IRepository options
   * @param returnPlain If true: return object, otherwise  return model
   * @returns The model/object with filled relations and files
   */
  static async _populateRelations(
    record,
    options: IRepositoryOptions,
    returnPlain = true,
    segmentId?: string,
    newIdentities?: boolean,
  ) {
    if (!record) {
      return record
    }

    let output

    if (returnPlain) {
      output = record.get({ plain: true })
    } else {
      output = record
    }

    const transaction = SequelizeRepository.getTransaction(options)

    const activityAggregates = await MemberRepository.getActivityAggregates(
      output.id,
      options,
      segmentId,
    )

    output.activeOn = activityAggregates?.activeOn || []
    output.activityCount = activityAggregates?.activityCount || 0
    output.activityTypes = activityAggregates?.activityTypes || []
    output.activeDaysCount = activityAggregates?.activeDaysCount || 0
    output.averageSentiment = activityAggregates?.averageSentiment || 0

    output.lastActivity =
      (
        await record.getActivities({
          order: [['timestamp', 'DESC']],
          limit: 1,
          transaction,
        })
      )[0]?.get({ plain: true }) ?? null

    output.lastActive = output.lastActivity?.timestamp ?? null

    output.numberOfOpenSourceContributions = output.contributions?.length ?? 0

    output.tags = await record.getTags({
      transaction,
      order: [['createdAt', 'ASC']],
      joinTableAttributes: [],
    })

    output.organizations = await record.getOrganizations({
      transaction,
      order: [['createdAt', 'ASC']],
      joinTableAttributes: ['dateStart', 'dateEnd', 'title', 'source'],
      through: {
        where: {
          deletedAt: null,
        },
      },
    })
    MemberRepository.sortOrganizations(output.organizations)

    output.tasks = await record.getTasks({
      transaction,
      order: [['createdAt', 'ASC']],
      joinTableAttributes: [],
    })

    output.notes = await record.getNotes({
      transaction,
      joinTableAttributes: [],
    })

    output.noMerge = (
      await record.getNoMerge({
        transaction,
      })
    ).map((i) => i.id)

    output.toMerge = (
      await record.getToMerge({
        transaction,
      })
    ).map((i) => i.id)

    const memberIdentities = (await this.getIdentities([record.id], options)).get(record.id)

    if (newIdentities === true) {
      output.identities = memberIdentities
      output.verifiedEmails = distinct(
        memberIdentities
          .filter((i) => i.verified && i.type === MemberIdentityType.EMAIL)
          .map((i) => i.value),
      )
      output.unverifiedEmails = distinct(
        memberIdentities
          .filter((i) => !i.verified && i.type === MemberIdentityType.EMAIL)
          .map((i) => i.value),
      )
      output.verifiedUsernames = distinct(
        memberIdentities
          .filter((i) => i.verified && i.type === MemberIdentityType.USERNAME)
          .map((i) => i.value),
      )
      output.unverifiedUsernames = distinct(
        memberIdentities
          .filter((i) => !i.verified && i.type === MemberIdentityType.USERNAME)
          .map((i) => i.value),
      )
      output.identityPlatforms = distinct(
        memberIdentities.filter((i) => i.verified).map((i) => i.platform),
      )
    } else {
      output.username = {}

      for (const identity of memberIdentities.filter(
        (i) => i.type === MemberIdentityType.USERNAME,
      )) {
        if (output.username[identity.platform]) {
          output.username[identity.platform].push(identity.value)
        } else {
          output.username[identity.platform] = [identity.value]
        }
      }

      output.identities = Object.keys(output.username)
    }

    output.affiliations = await this.getAffiliations(record.id, options)

    const manualSyncRemote = await new MemberSyncRemoteRepository(options).findMemberManualSync(
      record.id,
    )

    for (const syncRemote of manualSyncRemote) {
      if (output.attributes?.syncRemote) {
        output.attributes.syncRemote[syncRemote.platform] = syncRemote.status === SyncStatus.ACTIVE
      } else {
        output.attributes.syncRemote = {
          [syncRemote.platform]: syncRemote.status === SyncStatus.ACTIVE,
        }
      }
    }

    return output
  }

  static async updateMemberOrganizations(
    record,
    organizations,
    replace,
    options: IRepositoryOptions,
  ) {
    if (!organizations) {
      return
    }

    function iso(v) {
      return moment(v).toISOString()
    }

    await captureApiChange(
      options,
      memberEditOrganizationsAction(record.id, async (captureOldState, captureNewState) => {
        const originalOrgs = await MemberRepository.fetchWorkExperiences(record.id, options)

        captureOldState(originalOrgs)
        const newOrgs = [...originalOrgs]

        if (replace) {
          const toDelete = originalOrgs.filter(
            (originalOrg: any) =>
              !organizations.find(
                (newOrg) =>
                  originalOrg.organizationId === newOrg.id &&
                  originalOrg.title === (newOrg.title || null) &&
                  iso(originalOrg.dateStart) === iso(newOrg.startDate || null) &&
                  iso(originalOrg.dateEnd) === iso(newOrg.endDate || null),
              ),
          )

          for (const item of toDelete) {
            await MemberRepository.deleteWorkExperience((item as any).id, options)
            ;(item as any).delete = true
          }
        }

        for (const item of organizations) {
          const org = typeof item === 'string' ? { id: item } : item

          // we don't need to touch exactly same existing work experiences
          if (
            !originalOrgs.some(
              (w) =>
                w.organizationId === item.id &&
                w.dateStart === (item.startDate || null) &&
                w.dateEnd === (item.endDate || null),
            )
          ) {
            const newOrg = {
              memberId: record.id,
              organizationId: org.id,
              title: org.title,
              dateStart: org.startDate,
              dateEnd: org.endDate,
              source: org.source,
            }
            await MemberRepository.createOrUpdateWorkExperience(newOrg, options)
            await OrganizationRepository.includeOrganizationToSegments(org.id, options)
            newOrgs.push(newOrg)
          }
        }

        captureNewState(newOrgs)
      }),
    )
  }

  static async createOrUpdateWorkExperience(
    { memberId, organizationId, source, title = null, dateStart = null, dateEnd = null },
    options: IRepositoryOptions,
  ) {
    const seq = SequelizeRepository.getSequelize(options)
    const transaction = SequelizeRepository.getTransaction(options)

    if (dateStart) {
      // clean up organizations without dates if we're getting ones with dates
      await seq.query(
        `
          UPDATE "memberOrganizations"
          SET "deletedAt" = NOW()
          WHERE "memberId" = :memberId
          AND "organizationId" = :organizationId
          AND "dateStart" IS NULL
          AND "dateEnd" IS NULL
        `,
        {
          replacements: {
            memberId,
            organizationId,
          },
          type: QueryTypes.UPDATE,
          transaction,
        },
      )
    } else {
      const rows = await seq.query(
        `
          SELECT COUNT(*) AS count FROM "memberOrganizations"
          WHERE "memberId" = :memberId
          AND "organizationId" = :organizationId
          AND "dateStart" IS NOT NULL
          AND "deletedAt" IS NULL
        `,
        {
          replacements: {
            memberId,
            organizationId,
          },
          type: QueryTypes.SELECT,
          transaction,
        },
      )
      const row = rows[0] as any
      if (row.count > 0) {
        // if we're getting organization without dates, but there's already one with dates, don't insert
        return
      }
    }

    let conflictCondition = `("memberId", "organizationId", "dateStart", "dateEnd")`
    if (!dateEnd) {
      conflictCondition = `("memberId", "organizationId", "dateStart") WHERE "dateEnd" IS NULL`
    }
    if (!dateStart) {
      conflictCondition = `("memberId", "organizationId") WHERE "dateStart" IS NULL AND "dateEnd" IS NULL`
    }

    const onConflict =
      source === OrganizationSource.UI
        ? `ON CONFLICT ${conflictCondition} DO UPDATE SET "title" = :title, "dateStart" = :dateStart, "dateEnd" = :dateEnd, "deletedAt" = NULL, "source" = :source`
        : 'ON CONFLICT DO NOTHING'

    await seq.query(
      `
        INSERT INTO "memberOrganizations" ("memberId", "organizationId", "createdAt", "updatedAt", "title", "dateStart", "dateEnd", "source")
        VALUES (:memberId, :organizationId, NOW(), NOW(), :title, :dateStart, :dateEnd, :source)
        ${onConflict}
      `,
      {
        replacements: {
          memberId,
          organizationId,
          title: title || null,
          dateStart: dateStart || null,
          dateEnd: dateEnd || null,
          source: source || null,
        },
        type: QueryTypes.INSERT,
        transaction,
      },
    )
  }

  static async deleteWorkExperience(id, options: IRepositoryOptions) {
    const seq = SequelizeRepository.getSequelize(options)
    const transaction = SequelizeRepository.getTransaction(options)

    await seq.query(
      `
        UPDATE "memberOrganizations"
        SET "deletedAt" = NOW()
        WHERE "id" = :id
      `,
      {
        replacements: {
          id,
        },
        type: QueryTypes.UPDATE,
        transaction,
      },
    )
  }

  static async fetchWorkExperiences(
    memberId: string,
    options: IRepositoryOptions,
  ): Promise<IMemberOrganization[]> {
    const seq = SequelizeRepository.getSequelize(options)
    const transaction = SequelizeRepository.getTransaction(options)

    const query = `
      SELECT * FROM "memberOrganizations"
      WHERE "memberId" = :memberId
        AND "deletedAt" IS NULL
    `

    const records = await seq.query(query, {
      replacements: {
        memberId,
      },
      type: QueryTypes.SELECT,
      transaction,
    })

    return records as IMemberOrganization[]
  }

  static async findWorkExperience(
    memberId: string,
    timestamp: string,
    options: IRepositoryOptions,
  ) {
    const seq = SequelizeRepository.getSequelize(options)
    const transaction = SequelizeRepository.getTransaction(options)

    const query = `
      SELECT * FROM "memberOrganizations"
      WHERE "memberId" = :memberId
        AND (
          ("dateStart" <= :timestamp AND "dateEnd" >= :timestamp)
          OR ("dateStart" <= :timestamp AND "dateEnd" IS NULL)
        )
        AND "deletedAt" IS NULL
      ORDER BY "dateStart" DESC, id
      LIMIT 1
    `

    const records = await seq.query(query, {
      replacements: {
        memberId,
        timestamp,
      },
      type: QueryTypes.SELECT,
      transaction,
    })

    if (records.length === 0) {
      return null
    }

    return records[0]
  }

  static async findMostRecentOrganization(
    memberId: string,
    timestamp: string,
    options: IRepositoryOptions,
  ): Promise<any> {
    const seq = SequelizeRepository.getSequelize(options)
    const transaction = SequelizeRepository.getTransaction(options)

    const query = `
      SELECT * FROM "memberOrganizations"
      WHERE "memberId" = :memberId
        AND "dateStart" IS NULL
        AND "dateEnd" IS NULL
        AND "createdAt" <= :timestamp
        AND "deletedAt" IS NULL
      ORDER BY "createdAt" DESC, id
      LIMIT 1
    `
    const records = await seq.query(query, {
      replacements: {
        memberId,
        timestamp,
      },
      type: QueryTypes.SELECT,
      transaction,
    })

    if (records.length === 0) {
      return null
    }

    return records[0]
  }

  static async findMostRecentOrganizationEver(
    memberId: string,
    options: IRepositoryOptions,
  ): Promise<any> {
    const seq = SequelizeRepository.getSequelize(options)
    const transaction = SequelizeRepository.getTransaction(options)

    const query = `
      SELECT * FROM "memberOrganizations"
      WHERE "memberId" = :memberId
        AND "dateStart" IS NULL
        AND "dateEnd" IS NULL
        AND "deletedAt" IS NULL
      ORDER BY "createdAt", id
      LIMIT 1
    `
    const records = await seq.query(query, {
      replacements: {
        memberId,
      },
      type: QueryTypes.SELECT,
      transaction,
    })

    if (records.length === 0) {
      return null
    }

    return records[0]
  }

  static sortOrganizations(organizations) {
    organizations.sort((a, b) => {
      a = a.dataValues ? a.get({ plain: true }) : a
      b = b.dataValues ? b.get({ plain: true }) : b
      const aStart = a.memberOrganizations?.dateStart
      const bStart = b.memberOrganizations?.dateStart
      const aEnd = a.memberOrganizations?.dateEnd
      const bEnd = b.memberOrganizations?.dateEnd

      // Sorting:
      // 1. Those without dateEnd, but with dateStart should be at the top, orderd by dateStart
      // 2. Those with dateEnd and dateStart should be in the middle, ordered by dateEnd
      // 3. Those without dateEnd and dateStart should be at the bottom, ordered by name
      if (!aEnd && aStart) {
        if (!bEnd && bStart) {
          return aStart > bStart ? -1 : 1
        }
        if (bEnd && bStart) {
          return -1
        }
        return -1
      }
      if (aEnd && aStart) {
        if (!bEnd && bStart) {
          return 1
        }
        if (bEnd && bStart) {
          return aEnd > bEnd ? -1 : 1
        }
        return -1
      }

      if (!bEnd && bStart) {
        return 1
      }
      if (bEnd && bStart) {
        return 1
      }
      return a.name > b.name ? 1 : -1
    })
  }

  static async getMemberIdsandCountForEnrich(
    { limit = 20, offset = 0, orderBy = 'joinedAt_DESC', countOnly = false },
    options: IRepositoryOptions,
  ) {
    const tenant = SequelizeRepository.getCurrentTenant(options)
    const segmentIds = SequelizeRepository.getSegmentIds(options)
    const seq = SequelizeRepository.getSequelize(options)

    const params: any = {
      tenantId: tenant.id,
      segmentIds,
      limit,
      offset,
    }

    let orderByString = ''
    const orderByParts = orderBy.split('_')
    const direction = orderByParts[1].toLowerCase()
    switch (orderByParts[0]) {
      case 'joinedAt':
        orderByString = 'm."joinedAt"'
        break
      case 'displayName':
        orderByString = 'm."displayName"'
        break
      case 'reach':
        orderByString = "(m.reach ->> 'total')::int"
        break
      case 'score':
        orderByString = 'm.score'
        break

      default:
        throw new Error(`Invalid order by: ${orderBy}!`)
    }
    orderByString = `${orderByString} ${direction}`

    const countQuery = `
    SELECT count(*) FROM (
      SELECT m.id
      FROM members m
      JOIN "memberSegments" ms ON ms."memberId" = m.id
      WHERE m."tenantId" = :tenantId
      AND ms."segmentId" IN (:segmentIds)
      AND (m."lastEnriched" IS NULL OR date_part('month', age(now(), m."lastEnriched")) >= 6)
      AND m."deletedAt" is NULL
    ) as count
    `

    const memberCount = await seq.query(countQuery, {
      replacements: params,
      type: QueryTypes.SELECT,
    })

    if (countOnly) {
      return {
        count: (memberCount[0] as any).count,
        ids: [],
      }
    }

    const members = await seq.query(
      `SELECT m.id FROM members m
      JOIN "memberSegments" ms ON ms."memberId" = m.id
      WHERE m."tenantId" = :tenantId and ms."segmentId" in (:segmentIds)
      AND (m."lastEnriched" IS NULL OR date_part('month', age(now(), m."lastEnriched")) >= 6)
      AND m."deletedAt" is NULL
      ORDER BY ${orderByString}
      LIMIT :limit OFFSET :offset`,
      {
        replacements: params,
        type: QueryTypes.SELECT,
      },
    )

    return {
      count: (memberCount[0] as any).count,
      ids: members.map((i: any) => i.id),
    }
  }

  static async moveNotesBetweenMembers(
    fromMemberId: string,
    toMemberId: string,
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)

    const seq = SequelizeRepository.getSequelize(options)

    const params: any = {
      fromMemberId,
      toMemberId,
    }

    const deleteQuery = `
      delete from "memberNotes" using "memberNotes" as mn2
      where "memberNotes"."memberId" = :fromMemberId
      and "memberNotes"."noteId" = mn2."noteId"
      and mn2."memberId" = :toMemberId;
    `

    await seq.query(deleteQuery, {
      replacements: params,
      type: QueryTypes.DELETE,
      transaction,
    })

    const updateQuery = `
      update "memberNotes" set "memberId" = :toMemberId where "memberId" = :fromMemberId;
    `

    await seq.query(updateQuery, {
      replacements: params,
      type: QueryTypes.UPDATE,
      transaction,
    })
  }

  static async moveTasksBetweenMembers(
    fromMemberId: string,
    toMemberId: string,
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)

    const seq = SequelizeRepository.getSequelize(options)

    const params: any = {
      fromMemberId,
      toMemberId,
    }

    const deleteQuery = `
      delete from "memberTasks" using "memberTasks" as mt2
      where "memberTasks"."memberId" = :fromMemberId
      and "memberTasks"."taskId" = mt2."taskId"
      and mt2."memberId" = :toMemberId;
    `

    await seq.query(deleteQuery, {
      replacements: params,
      type: QueryTypes.DELETE,
      transaction,
    })

    const updateQuery = `
      update "memberTasks" set "memberId" = :toMemberId where "memberId" = :fromMemberId;
    `

    await seq.query(updateQuery, {
      replacements: params,
      type: QueryTypes.UPDATE,
      transaction,
    })
  }

  static async moveAffiliationsBetweenMembers(
    fromMemberId: string,
    toMemberId: string,
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)

    const seq = SequelizeRepository.getSequelize(options)

    const params: any = {
      fromMemberId,
      toMemberId,
    }

    const updateQuery = `
      update "memberSegmentAffiliations" set "memberId" = :toMemberId where "memberId" = :fromMemberId;
    `

    await seq.query(updateQuery, {
      replacements: params,
      type: QueryTypes.UPDATE,
      transaction,
    })
  }

  static async moveSelectedAffiliationsBetweenMembers(
    fromMemberId: string,
    toMemberId: string,
    memberSegmentAffiliationIds: string[],
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)

    const seq = SequelizeRepository.getSequelize(options)

    const params: any = {
      fromMemberId,
      toMemberId,
      memberSegmentAffiliationIds,
    }

    const updateQuery = `
      update "memberSegmentAffiliations" set "memberId" = :toMemberId where "memberId" = :fromMemberId
      and "id" in (:memberSegmentAffiliationIds);
    `

    await seq.query(updateQuery, {
      replacements: params,
      type: QueryTypes.UPDATE,
      transaction,
    })
  }

  static async addTagsToMember(
    memberId: string,
    tagIds: string[],
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)

    const seq = SequelizeRepository.getSequelize(options)

    const query = `
      insert into "memberTags" ("memberId", "tagId", "createdAt", "updatedAt") values (:memberId, :tagId, now(), now());
    `
    for (const tagId of tagIds) {
      await seq.query(query, {
        replacements: {
          memberId,
          tagId,
        },
        type: QueryTypes.INSERT,
        transaction,
      })
    }
  }

  static async removeTagsFromMember(
    memberId: string,
    tagIds: string[],
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)

    const seq = SequelizeRepository.getSequelize(options)

    const query = `
      delete from "memberTags" where "memberId" = :memberId and "tagId" = :tagId;
    `
    for (const tagId of tagIds) {
      await seq.query(query, {
        replacements: {
          memberId,
          tagId,
        },
        type: QueryTypes.DELETE,
        transaction,
      })
    }
  }

  static async addNotesToMember(
    memberId: string,
    noteIds: string[],
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)

    const seq = SequelizeRepository.getSequelize(options)

    const query = `
      insert into "memberNotes" ("memberId", "noteId", "createdAt", "updatedAt") values (:memberId, :noteId, now(), now());
    `

    for (const noteId of noteIds) {
      await seq.query(query, {
        replacements: {
          memberId,
          noteId,
        },
        type: QueryTypes.INSERT,
        transaction,
      })
    }
  }

  static async removeNotesFromMember(
    memberId: string,
    noteIds: string[],
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)

    const seq = SequelizeRepository.getSequelize(options)

    const query = `
      delete from "memberNotes" where "memberId" = :memberId and "noteId" = :noteId;
    `

    for (const noteId of noteIds) {
      await seq.query(query, {
        replacements: {
          memberId,
          noteId,
        },
        type: QueryTypes.DELETE,
        transaction,
      })
    }
  }

  static async addTasksToMember(
    memberId: string,
    taskIds: string[],
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)

    const seq = SequelizeRepository.getSequelize(options)

    const query = `
      insert into "memberTasks" ("memberId", "taskId", "createdAt", "updatedAt") values (:memberId, :taskId, now(), now());
    `

    for (const taskId of taskIds) {
      await seq.query(query, {
        replacements: {
          memberId,
          taskId,
        },
        type: QueryTypes.INSERT,
        transaction,
      })
    }
  }

  static async removeTasksFromMember(
    memberId: string,
    taskIds: string[],
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)

    const seq = SequelizeRepository.getSequelize(options)

    const query = `
      delete from "memberTasks" where "memberId" = :memberId and "taskId" = :taskId;
    `

    for (const taskId of taskIds) {
      await seq.query(query, {
        replacements: {
          memberId,
          taskId,
        },
        type: QueryTypes.DELETE,
        transaction,
      })
    }
  }

  static async removeIdentitiesFromMember(
    memberId: string,
    identities: IMemberIdentity[],
    options: IRepositoryOptions,
  ): Promise<void> {
    const transaction = SequelizeRepository.getTransaction(options)

    const qx = SequelizeRepository.getQueryExecutor(options, transaction)

    for (const identity of identities) {
      await deleteMemberIdentities(qx, {
        memberId,
        value: identity.value,
        type: identity.type,
        platform: identity.platform,
      })
    }
  }
}

export default MemberRepository
