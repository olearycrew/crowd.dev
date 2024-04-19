import { safeWrap } from '../../middlewares/errorMiddleware'
import auditLogList from './auditLogList'
import auditLogsQuery from './auditLogsQuery'

export default (app) => {
  app.get(`/tenant/:tenantId/audit-log`, safeWrap(auditLogList))

  app.post(`/tenant/:tenantId/audit-logs/query`, safeWrap(auditLogsQuery))
}
