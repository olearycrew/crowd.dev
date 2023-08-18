// processData.ts content
import { ProcessDataHandler } from '../../types'
import {
  GroupsioPublishData,
  GroupsioPublishDataType,
  GroupsioMessageData,
  MemberInfo,
  GroupsioActivityType,
} from './types'
import { IActivityData, IMemberData, PlatformType } from '@crowd/types'

const processMemberJoin: ProcessDataHandler = async (ctx) => {
  const data = ctx.data as GroupsioPublishData
  const memberData = data.data as MemberInfo

  const member: IMemberData = {
    displayName: memberData.full_name,
    emails: [memberData.email],
    identities: [
      {
        sourceId: memberData.user_id.toString(),
        platform: PlatformType.GROUPSIO,
        username: memberData.email,
      },
    ],
  }

  const activity: IActivityData = {
    type: GroupsioActivityType.MEMBER_JOIN,
    member,
    // 2020-09-05T13:57:00-07:00
    timestamp: new Date(memberData.created).toISOString(),
  }
}

const processMessage: ProcessDataHandler = async (ctx) => {
  const data = ctx.data as GroupsioPublishData
  const messageData = data.data as GroupsioMessageData

  const member: IMemberData = {
    displayName: messageData.message.from.name,
    emails: [messageData.message.from.email],
    identities: [
      {
        sourceId: messageData.message.user_id.toString(),
        platform: PlatformType.GROUPSIO,
        username: messageData.message.from.email,
      },
    ],
  }
}

const handler: ProcessDataHandler = async (ctx) => {
  const data = ctx.data as GroupsioPublishData

  const type = data.type

  switch (type) {
    case GroupsioPublishDataType.MEMBER_JOIN:
      await processMemberJoin(ctx)
      break
    case GroupsioPublishDataType.MESSAGE:
      await processMessage(ctx)
      break
    default:
      await ctx.abortRunWithError(`Unknown publish data type: ${type}`)
  }
}

export default handler
