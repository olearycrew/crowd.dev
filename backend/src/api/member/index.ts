import { FeatureFlag } from '@crowd/types'
import { safeWrap } from '../../middlewares/errorMiddleware'
import { featureFlagMiddleware } from '../../middlewares/featureFlagMiddleware'
import memberQuery from './memberQuery'
import memberExport from './memberExport'
import memberCreate from './memberCreate'
import memberUpdate from './memberUpdate'
import memberImport from './memberImport'
import memberDestroy from './memberDestroy'
import memberAutocomplete from './memberAutocomplete'
import memberList from './memberList'
import memberActiveList from './memberActiveList'
import memberFind from './memberFind'
import memberFindGithub from './memberFindGithub'
import memberMerge from './memberMerge'
import memberUnmergePreview from './memberUnmergePreview'
import memberUnmerge from './memberUnmerge'
import memberNotMerge from './memberNotMerge'
import memberUpdateBulk from './memberUpdateBulk'

export default (app) => {
  app.post(`/tenant/:tenantId/member/query`, safeWrap(memberQuery))

  app.post(
    `/tenant/:tenantId/member/export`,
    featureFlagMiddleware(FeatureFlag.CSV_EXPORT, 'errors.csvExport.planLimitExceeded'),
    safeWrap(memberExport),
  )

  app.post(`/tenant/:tenantId/member`, safeWrap(memberCreate))
  app.put(`/tenant/:tenantId/member/:id`, safeWrap(memberUpdate))
  app.post(`/tenant/:tenantId/member/import`, safeWrap(memberImport))
  app.delete(`/tenant/:tenantId/member`, safeWrap(memberDestroy))
  // TODO uros check with gasper
  app.post(`/tenant/:tenantId/member/autocomplete`, safeWrap(memberAutocomplete))
  app.get(`/tenant/:tenantId/member`, safeWrap(memberList))
  app.get(`/tenant/:tenantId/member/active`, safeWrap(memberActiveList))
  app.get(`/tenant/:tenantId/member/:id`, safeWrap(memberFind))
  app.get(
    `/tenant/:tenantId/member/github/:id`,
    featureFlagMiddleware(FeatureFlag.FIND_GITHUB, 'errors.featureFlag.notEnabled'),
    safeWrap(memberFindGithub),
  )
  app.put(`/tenant/:tenantId/member/:memberId/merge`, safeWrap(memberMerge))

  app.post(`/tenant/:tenantId/member/:memberId/unmerge/preview`, safeWrap(memberUnmergePreview))

  app.post(`/tenant/:tenantId/member/:memberId/unmerge`, safeWrap(memberUnmerge))

  app.put(`/tenant/:tenantId/member/:memberId/no-merge`, safeWrap(memberNotMerge))
  app.patch(`/tenant/:tenantId/member`, safeWrap(memberUpdateBulk))
}
