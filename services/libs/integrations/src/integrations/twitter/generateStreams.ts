import { GenerateStreamsHandler } from '../../types'
import { TwitterIntegrationSettings } from './types'

const handler: GenerateStreamsHandler = async (ctx) => {
  const settings = ctx.integration.settings as TwitterIntegrationSettings
  const hashtags = settings.hashtags

  const arr = ['followers', 'mentions'].concat((hashtags || []).map((h) => `hashtag/${h}`))

  for (const hashtag of arr) {
    await ctx.publishStream(`hashtag/${hashtag}`, {
      hashtag,
      page: '',
    })
  }
}

export default handler
