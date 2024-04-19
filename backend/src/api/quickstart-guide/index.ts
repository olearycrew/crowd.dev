import { safeWrap } from '../../middlewares/errorMiddleware'
import quickstartGuideList from './quickstartGuideList'
import quickstartGuideSettingsUpdate from './quickstartGuideSettingsUpdate'

export default (app) => {
  app.get(`/tenant/:tenantId/quickstart-guide`, safeWrap(quickstartGuideList))
  app.post(`/tenant/:tenantId/quickstart-guide/settings`, safeWrap(quickstartGuideSettingsUpdate))
}
