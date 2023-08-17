// generateStreams.ts content
import { GenerateStreamsHandler } from '../../types'
import { GroupsioIntegrationSettings, GroupsioGroupStreamMetadata } from './types'

const handler: GenerateStreamsHandler = async (ctx) => {
  const settings = ctx.integration.settings as GroupsioIntegrationSettings

  const groups = settings.groups
  const token = settings.token
  const email = settings.email

  if (!groups || groups.length === 0) {
    await ctx.abortRunWithError('No groups specified!')
  }

  if (!token) {
    await ctx.abortRunWithError('No token specified!')
  }

  if (!email) {
    await ctx.abortRunWithError('No email specified!')
  }

  for (const group of groups) {
    await ctx.publishStream<GroupsioGroupStreamMetadata>(`group-${group}`, { group })
  }
}

export default handler
