// processStream.ts content
import { ProcessStreamHandler } from '../../types'
import {
  GroupsioStreamType,
  GroupsioGroupStreamMetadata,
  GroupsioGroupMembersStreamMetadata,
  GroupsioMemberStreamMetadata,
  GroupsioIntegrationSettings,
  GroupsioTopicStreamMetadata,
  GroupsioMessageData,
  GroupsioPublishData,
  GroupsioPublishDataType,
  MemberInfo,
  ListMembers,
  ListMessages,
  ListTopics,
} from './types'
import { getTopicsFromGroup } from './api/getTopicsFromGroup'
import { getMessagesFromTopic } from './api/getMessagesFromTopic'
import { getGroupMembers } from './api/getGroupMembers'
import { getGroupMember } from './api/getGroupMember'

const processGroupStream: ProcessStreamHandler = async (ctx) => {
  const data = ctx.stream.data as GroupsioGroupStreamMetadata
  const settings = ctx.integration.settings as GroupsioIntegrationSettings

  const response = (await getTopicsFromGroup(
    data.group,
    settings.token,
    ctx,
    data.page,
  )) as ListTopics

  // processing next page stream
  if (response.next_page_token) {
    await ctx.publishStream<GroupsioGroupStreamMetadata>(
      `${GroupsioStreamType.GROUP}-${data.group}-${response.next_page_token}`,
      {
        group: data.group,
        page: response.next_page_token.toString(),
      },
    )
  }

  // publishing topic streams
  for (const topic of response.data) {
    await ctx.publishStream<GroupsioTopicStreamMetadata>(
      `${GroupsioStreamType.TOPIC}:${topic.id}`,
      {
        group: data.group,
        topic,
        page: null,
      },
    )
  }
}

const processTopicStream: ProcessStreamHandler = async (ctx) => {
  const data = ctx.stream.data as GroupsioTopicStreamMetadata
  const settings = ctx.integration.settings as GroupsioIntegrationSettings

  const response = (await getMessagesFromTopic(
    data.topic.id.toString(),
    settings.token,
    ctx,
    data.page,
  )) as ListMessages

  // processing next page stream
  if (response.next_page_token) {
    await ctx.publishStream<GroupsioTopicStreamMetadata>(
      `${GroupsioStreamType.TOPIC}-${data.topic.id}-${response.next_page_token}`,
      {
        group: data.group,
        topic: data.topic,
        page: response.next_page_token.toString(),
      },
    )
  }

  // publishing messags
  for (const message of response.data) {
    await ctx.publishData<GroupsioPublishData>({
      type: GroupsioPublishDataType.MESSAGE,
      data: {
        message,
        group: data.group,
        topic: data.topic,
      },
    })
  }
}

const processGroupMembersStream: ProcessStreamHandler = async (ctx) => {
  const data = ctx.stream.data as GroupsioGroupMembersStreamMetadata
  const settings = ctx.integration.settings as GroupsioIntegrationSettings

  const response = (await getGroupMembers(
    data.group,
    settings.token,
    ctx,
    data.page,
  )) as ListMembers

  // processing next page stream
  if (response.next_page_token) {
    await ctx.publishStream<GroupsioGroupMembersStreamMetadata>(
      `${GroupsioStreamType.GROUP_MEMBERS}-${data.group}-${response.next_page_token}`,
      {
        group: data.group,
        page: response.next_page_token.toString(),
      },
    )
  }

  // publish members
  for (const member of response.data) {
    await ctx.publishData<GroupsioPublishData>({
      type: GroupsioPublishDataType.MEMBER_JOIN,
      data: member,
    })
  }
}

const handler: ProcessStreamHandler = async (ctx) => {
  const streamIdentifier = ctx.stream.identifier

  const streamType = streamIdentifier.split(':')[0]

  switch (streamType) {
    case GroupsioStreamType.GROUP:
      await processGroupStream(ctx)
      break
    case GroupsioStreamType.TOPIC:
      await processTopicStream(ctx)
      break
    case GroupsioStreamType.GROUP_MEMBERS:
      await processGroupMembersStream(ctx)
      break
    default:
      await ctx.abortRunWithError(`Unknown stream type: ${streamType}`)
      break
  }
}

export default handler
