import axios, { AxiosRequestConfig } from 'axios'
import { IProcessStreamContext } from '@/types'

export const getMessagesFromTopic = async (
  group: string,
  cookie: string,
  ctx: IProcessStreamContext,
  page: string = null,
) => {
  const config: AxiosRequestConfig = {
    method: 'get',
    url: `https://groups.io/api/v1/gettopics?group=${group}` + (page ? `&page=${page}` : ''),
    headers: {
      Cookie: cookie,
    },
  }

  try {
    const response = await axios(config)
    return response.data
  } catch (err) {
    ctx.log.error(err, { group }, 'Error fetching topics from group!')
    throw err
  }
}
