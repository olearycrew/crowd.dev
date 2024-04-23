import { MemberSyncService, OpenSearchService } from '@crowd/opensearch'
import { getServiceLogger } from '@crowd/logging'
import { DB_CONFIG, OPENSEARCH_CONFIG, REDIS_CONFIG, SERVICE_CONFIG } from '../conf'
import { getRedisClient } from '@crowd/redis'
import { DbStore, getDbConnection } from '@crowd/data-access-layer/src/database'

const log = getServiceLogger()

const processArguments = process.argv.slice(2)

if (processArguments.length !== 1) {
  log.error('Expected 1 arguments: memberId')
  process.exit(1)
}

const memberId = processArguments[0]

setImmediate(async () => {
  const openSearchService = new OpenSearchService(log, OPENSEARCH_CONFIG())

  const redis = await getRedisClient(REDIS_CONFIG(), true)

  const dbConnection = await getDbConnection(DB_CONFIG())
  const store = new DbStore(log, dbConnection)

  const service = new MemberSyncService(redis, store, openSearchService, log, SERVICE_CONFIG())

  const result = await service.getMemberDocs()

  console.log(JSON.stringify(result, null, 2))

  process.exit(0)
})
