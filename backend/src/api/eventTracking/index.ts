import { safeWrap } from '../../middlewares/errorMiddleware'
import eventTrack from './eventTrack'

export default (app) => {
  app.post(`/tenant/:tenantId/event-tracking`, safeWrap(eventTrack))
}
