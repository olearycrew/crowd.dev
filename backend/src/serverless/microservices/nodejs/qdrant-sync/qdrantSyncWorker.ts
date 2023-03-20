import axios from 'axios'
import getUserContext from '../../../../database/utils/getUserContext'
import { IRepositoryOptions } from '../../../../database/repositories/IRepositoryOptions'
import { createServiceChildLogger } from '../../../../utils/logging'
import ActivityRepository from '../../../../database/repositories/activityRepository'
import { QDRANT_SYNC_CONFIG } from '../../../../config'

const log = createServiceChildLogger('qdrantSyncWorker')

async function embed(activity) {
  const text = `${activity.title || ''} 
  ${activity.body || ''}`
  const response = await axios.post(
    'https://api.openai.com/v1/embeddings',
    {
      input: text,
      model: 'text-embedding-ada-002',
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${QDRANT_SYNC_CONFIG.openaiApiKey}`,
      },
    },
  )
  return response.data.data[0].embedding
}

async function upsertPoints(points) {
  try {
    const response = await axios.put(
      `${QDRANT_SYNC_CONFIG.qdrantHost}/collections/${QDRANT_SYNC_CONFIG.qdrantCollection}/points`,
      { points },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': QDRANT_SYNC_CONFIG.qdrantApiKey,
        },
        params: {
          wait: true,
        },
      },
    )
    return response.data
  } catch (e) {
    log.error('Error while upserting points', e)
    throw e
  }
}

async function countPoints(tenantId) {
  try {
    const response = await axios.post(
      `${QDRANT_SYNC_CONFIG.qdrantHost}/collections/${QDRANT_SYNC_CONFIG.qdrantCollection}/points/count`,
      {
        filter: {
          must: [
            {
              key: 'tenantId',
              match: {
                value: tenantId,
              },
            },
          ],
        },
        exact: true,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': QDRANT_SYNC_CONFIG.qdrantApiKey,
        },
      },
    )
    return response.data.result.count
  } catch (e) {
    log.error('Error while upserting points', e)
    throw e
  }
}

async function qdrantSyncWorker(tenantId): Promise<void> {
  const userContext: IRepositoryOptions = await getUserContext(tenantId)

  const count = await countPoints(tenantId)
  let createdAt
  if (!count) {
    // 1970 to isostring
    createdAt = '1970-01-01T00:00:00.000Z'
  } else {
    // 2h ago to isostring
    createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  }

  const activities = await ActivityRepository.findForQdrant(createdAt, userContext)

  console.log('Count', count)
  console.log('createdAt', createdAt)

  // Split the activities list into chunks of N
  const chunkSize = 100
  const chunks = []
  for (let i = 0; i < activities.length; i += chunkSize) {
    chunks.push(activities.slice(i, i + chunkSize))
  }

  for (const chunk of chunks) {
    const points = []
    for (const activity of chunk) {
      points.push({
        id: activity.id.toString(),
        payload: activity,
        vector: await embed(activity),
      })
    }
    console.log(await upsertPoints(points))
  }
}

export { qdrantSyncWorker }
