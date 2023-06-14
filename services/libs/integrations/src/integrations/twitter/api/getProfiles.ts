import axios, { AxiosRequestConfig } from 'axios'
import { TwitterGetFollowersOutput, TwitterGetProfilesByUsernameInput } from '../types'
import { handleTwitterError } from './errorHandler'
import { getNangoToken } from '../../nango'
import { IProcessStreamContext } from '@/types'

/**
 * Get profiles by username
 * @param input Input parameters
 * @returns Profiles
 */
const getProfiles = async (
  input: TwitterGetProfilesByUsernameInput,
  ctx: IProcessStreamContext,
): Promise<TwitterGetFollowersOutput> => {
  // Get an access token from Nango
  const accessToken = await getNangoToken(input.nangoId, 'twitter', ctx)

  const config: AxiosRequestConfig<any> = {
    method: 'get',
    url: 'https://api.twitter.com/2/users/by',
    params: {
      usernames: input.usernames.join(','),
      'user.fields': 'name,description,location,public_metrics,url,verified,profile_image_url',
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }

  try {
    const response = await axios(config)
    const limit = parseInt(response.headers['x-rate-limit-remaining'], 10)
    const resetTs = parseInt(response.headers['x-rate-limit-reset'], 10) * 1000
    const timeUntilReset = Math.floor((resetTs - new Date().getTime()) / 1000)
    return {
      records: response.data.data,
      nextPage: response.data?.meta?.next_token || '',
      limit,
      timeUntilReset,
    }
  } catch (err) {
    const newErr = handleTwitterError(err, config, input, ctx.log)
    throw newErr
  }
}

export default getProfiles
