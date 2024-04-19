import { safeWrap } from '../../middlewares/errorMiddleware'
import activityCreate from './activityCreate'
import activityQuery from './activityQuery'
import activityUpdate from './activityUpdate'
import activityImport from './activityImport'
import activityDestroy from './activityDestroy'
import activityAutocomplete from './activityAutocomplete'
import activityList from './activityList'
import activityTypes from './activityTypes'
import activityChannels from './activityChannels'
import activityAddWithMember from './activityAddWithMember'

export default (app) => {
  app.post(`/tenant/:tenantId/activity`, safeWrap(activityCreate))
  app.post(`/tenant/:tenantId/activity/query`, safeWrap(activityQuery))
  app.put(`/tenant/:tenantId/activity/:id`, safeWrap(activityUpdate))
  app.post(`/tenant/:tenantId/activity/import`, safeWrap(activityImport))
  app.delete(`/tenant/:tenantId/activity`, safeWrap(activityDestroy))
  app.get(`/tenant/:tenantId/activity/autocomplete`, safeWrap(activityAutocomplete))
  app.get(`/tenant/:tenantId/activity`, safeWrap(activityList))
  app.get(`/tenant/:tenantId/activity/type`, safeWrap(activityTypes))
  app.get(`/tenant/:tenantId/activity/channel`, safeWrap(activityChannels))
  app.post(
    '/tenant/:tenantId/activity/with-member',
    // Call the addActivityWithMember file in this dir
    safeWrap(activityAddWithMember),
  )
}
