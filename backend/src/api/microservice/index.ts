import { safeWrap } from '../../middlewares/errorMiddleware'
import microserviceCreate from './microserviceCreate'
import microserviceQuery from './microserviceQuery'
import microserviceUpdate from './microserviceUpdate'
import microserviceImport from './microserviceImport'
import microserviceDestroy from './microserviceDestroy'
import microserviceAutocomplete from './microserviceAutocomplete'
import microserviceList from './microserviceList'
import microserviceFind from './microserviceFind'

export default (app) => {
  app.post(`/tenant/:tenantId/microservice`, safeWrap(microserviceCreate))
  app.post(`/tenant/:tenantId/microservice/query`, safeWrap(microserviceQuery))
  app.put(`/tenant/:tenantId/microservice/:id`, safeWrap(microserviceUpdate))
  app.post(`/tenant/:tenantId/microservice/import`, safeWrap(microserviceImport))
  app.delete(`/tenant/:tenantId/microservice`, safeWrap(microserviceDestroy))
  app.get(`/tenant/:tenantId/microservice/autocomplete`, safeWrap(microserviceAutocomplete))
  app.get(`/tenant/:tenantId/microservice`, safeWrap(microserviceList))
  app.get(`/tenant/:tenantId/microservice/:id`, safeWrap(microserviceFind))
}
