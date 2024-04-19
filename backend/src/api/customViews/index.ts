import { safeWrap } from '../../middlewares/errorMiddleware'
import customViewCreate from './customViewCreate'
import customViewUpdate from './customViewUpdate'
import customViewUpdateBulk from './customViewUpdateBulk'
import customViewDestroy from './customViewDestroy'
import customViewQuery from './customViewQuery'

export default (app) => {
  app.post(`/tenant/:tenantId/customview`, safeWrap(customViewCreate))
  app.put(`/tenant/:tenantId/customview/:id`, safeWrap(customViewUpdate))
  app.patch(`/tenant/:tenantId/customview`, safeWrap(customViewUpdateBulk))
  app.delete(`/tenant/:tenantId/customview`, safeWrap(customViewDestroy))
  app.get(`/tenant/:tenantId/customview`, safeWrap(customViewQuery))
}
