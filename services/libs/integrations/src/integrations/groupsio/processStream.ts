// processStream.ts content
import { ProcessStreamHandler } from '../../types'
import {
  GroupsioStreamType,
  GroupsioGroupStreamMetadata,
  GroupsioIntegrationSettings,
  GroupsioTopicStreamMetadata,
  ListTopics,
} from './types'
import { getTopicsFromGroup } from './api/getTopicsFromGroup'

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
        topic,
        page: null,
      },
    )
  }
}

const processTopicStream: ProcessStreamHandler = async (ctx) => {
  const data = ctx.stream.data as GroupsioTopicStreamMetadata
  const settings = ctx.integration.settings as GroupsioIntegrationSettings
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
    default:
      await ctx.abortRunWithError(`Unknown stream type: ${streamType}`)
      break
  }
}

export default handler
