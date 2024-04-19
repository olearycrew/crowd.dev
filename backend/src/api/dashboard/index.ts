import { safeWrap } from '../../middlewares/errorMiddleware'
import dashboardGet from './dashboardGet'

export default (app) => {
  app.get(`/tenant/:tenantId/dashboard`, safeWrap(dashboardGet))
}
