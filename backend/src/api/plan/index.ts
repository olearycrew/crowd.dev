import { safeWrap } from '../../middlewares/errorMiddleware'
import webhook from './stripe/webhook'
import portal from './stripe/portal'
import checkout from './stripe/checkout'

export default (app) => {
  app.post(`/plan/stripe/webhook`, safeWrap(webhook))
  app.post(`/tenant/:tenantId/plan/stripe/portal`, safeWrap(portal))
  app.post(`/tenant/:tenantId/plan/stripe/checkout`, safeWrap(checkout))
}
