import { MemberSyncService, OpenSearchService } from '@crowd/opensearch'
import { getServiceLogger } from '@crowd/logging'
import { DB_CONFIG, OPENSEARCH_CONFIG, REDIS_CONFIG, SERVICE_CONFIG } from '../conf'
import { getRedisClient } from '@crowd/redis'
import { DbStore, getDbConnection } from '@crowd/data-access-layer/src/database'

const log = getServiceLogger()

setImmediate(async () => {
  const openSearchService = new OpenSearchService(log, OPENSEARCH_CONFIG())

  const redis = await getRedisClient(REDIS_CONFIG(), true)

  const dbConnection = await getDbConnection(DB_CONFIG())
  const store = new DbStore(log, dbConnection)

  const service = new MemberSyncService(redis, store, openSearchService, log, SERVICE_CONFIG())

  console.log('started fixing old format members...')

  const count = await service.getMemberDocsCount()

  console.log('count:', count)

  await service.resyncMembers()

  console.log('completed resyncing members...')

  process.exit(0)
})
