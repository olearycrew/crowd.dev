import { safeWrap } from '../../middlewares/errorMiddleware'
import conversationCreate from './conversationCreate'
import conversationUpdate from './conversationUpdate'
import conversationDestroy from './conversationDestroy'
import conversationQuery from './conversationQuery'
import conversationList from './conversationList'
import conversationFind from './conversationFind'
import conversationSettingsUpdate from './conversationSettingsUpdate'

export default (app) => {
  app.post(`/tenant/:tenantId/conversation`, safeWrap(conversationCreate))
  app.put(`/tenant/:tenantId/conversation/:id`, safeWrap(conversationUpdate))
  app.delete(`/tenant/:tenantId/conversation`, safeWrap(conversationDestroy))
  app.post(`/tenant/:tenantId/conversation/query`, safeWrap(conversationQuery))
  app.get(`/tenant/:tenantId/conversation`, safeWrap(conversationList))
  app.get(`/tenant/:tenantId/conversation/:id`, safeWrap(conversationFind))
  app.post(`/tenant/:tenantId/conversation/settings`, safeWrap(conversationSettingsUpdate))
}
