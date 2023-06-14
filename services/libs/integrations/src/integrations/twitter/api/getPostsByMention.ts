import axios, { AxiosRequestConfig } from 'axios'
import { TwitterGetPostsByMentionInput, TwitterGetPostsOutput, TwitterParsedPosts } from '../types'
import { handleTwitterError } from './errorHandler'
import { getNangoToken } from '../../nango'
import { IProcessStreamContext } from '@/types'

/**
 * Get paginated posts by mention
 * @param input Input parameters
 * @returns Posts
 */
const getPostsByMention = async (
  input: TwitterGetPostsByMentionInput,
  ctx: IProcessStreamContext,
): Promise<TwitterGetPostsOutput> => {
  // Get an access token from Nango
  const accessToken = await getNangoToken(input.nangoId, 'twitter', ctx)

  const config: AxiosRequestConfig<any> = {
    method: 'get',
    url: `https://api.twitter.com/2/users/${input.profileId}/mentions`,
    params: {
      max_results: input.perPage,
      'tweet.fields': 'id,text,created_at,attachments,referenced_tweets,entities',
      'media.fields': 'duration_ms,height,media_key,preview_image_url,type,url,width,alt_text',
      'user.fields': 'name,description,location,public_metrics,url,verified,profile_image_url',
      expansions: 'attachments.media_keys,author_id',
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }

  if (input.page !== undefined && input.page !== '') {
    config.params.pagination_token = input.page
  }

  try {
    const response = await axios(config)

    let limit: number
    let timeUntilReset: number
    if (response.headers['x-rate-limit-remaining'] && response.headers['x-rate-limit-reset']) {
      limit = parseInt(response.headers['x-rate-limit-remaining'], 10)
      const resetTs = parseInt(response.headers['x-rate-limit-reset'], 10) * 1000
      timeUntilReset = Math.floor((resetTs - new Date().getTime()) / 1000)
    } else {
      limit = 0
      timeUntilReset = 0
    }

    if (
      response.data.meta &&
      response.data.meta.result_count &&
      response.data.meta.result_count > 0
    ) {
      const posts = response.data.data
      const media = response.data.includes.media
      const users = response.data.includes.users

      const postsOut: TwitterParsedPosts = []

      for (const post of posts) {
        if (post.attachments?.media_keys) {
          const computedMedia = post.attachments.media_keys.map((key) =>
            media.find((m) => m.media_key === key),
          )
          post.attachments = computedMedia
        }
        const member = users.find((u) => u.id === post.author_id)
        post.member = member
        postsOut.push(post)
      }

      return {
        records: postsOut,
        nextPage: response.data?.meta?.next_token || '',
        limit,
        timeUntilReset,
      }
    }
    return {
      records: [],
      nextPage: '',
      limit,
      timeUntilReset,
    }
  } catch (err) {
    const newErr = handleTwitterError(err, config, input, ctx.log)
    throw newErr
  }
}

export default getPostsByMention
