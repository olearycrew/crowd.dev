import { FeatureFlag } from '@crowd/types'
import { safeWrap } from '../../middlewares/errorMiddleware'
import { featureFlagMiddleware } from '../../middlewares/featureFlagMiddleware'
import eagleEyeContentQuery from './eagleEyeContentQuery'
import eagleEyeContentUpsert from './eagleEyeContentUpsert'
import eagleEyeContentTrack from './eagleEyeContentTrack'
import eagleEyeContentReply from './eagleEyeContentReply'
import eagleEyeContentSearch from './eagleEyeContentSearch'
import eagleEyeContentFind from './eagleEyeContentFind'
import eagleEyeActionCreate from './eagleEyeActionCreate'
import eagleEyeSettingsUpdate from './eagleEyeSettingsUpdate'
import eagleEyeActionDestroy from './eagleEyeActionDestroy'

export default (app) => {
  app.post(
    `/tenant/:tenantId/eagleEyeContent/query`,
    featureFlagMiddleware(FeatureFlag.EAGLE_EYE, 'entities.eagleEye.errors.planLimitExceeded'),
    safeWrap(eagleEyeContentQuery),
  )

  app.post(
    `/tenant/:tenantId/eagleEyeContent`,
    featureFlagMiddleware(FeatureFlag.EAGLE_EYE, 'entities.eagleEye.errors.planLimitExceeded'),
    safeWrap(eagleEyeContentUpsert),
  )

  app.post(
    `/tenant/:tenantId/eagleEyeContent/track`,
    featureFlagMiddleware(FeatureFlag.EAGLE_EYE, 'entities.eagleEye.errors.planLimitExceeded'),
    safeWrap(eagleEyeContentTrack),
  )

  app.get(
    `/tenant/:tenantId/eagleEyeContent/reply`,
    featureFlagMiddleware(FeatureFlag.EAGLE_EYE, 'entities.eagleEye.errors.planLimitExceeded'),
    safeWrap(eagleEyeContentReply),
  )

  app.get(
    `/tenant/:tenantId/eagleEyeContent/search`,
    featureFlagMiddleware(FeatureFlag.EAGLE_EYE, 'entities.eagleEye.errors.planLimitExceeded'),
    safeWrap(eagleEyeContentSearch),
  )

  app.get(
    `/tenant/:tenantId/eagleEyeContent/:id`,
    featureFlagMiddleware(FeatureFlag.EAGLE_EYE, 'entities.eagleEye.errors.planLimitExceeded'),
    safeWrap(eagleEyeContentFind),
  )

  app.post(
    `/tenant/:tenantId/eagleEyeContent/:contentId/action`,
    featureFlagMiddleware(FeatureFlag.EAGLE_EYE, 'entities.eagleEye.errors.planLimitExceeded'),
    safeWrap(eagleEyeActionCreate),
  )

  app.put(
    `/tenant/:tenantId/eagleEyeContent/settings`,
    featureFlagMiddleware(FeatureFlag.EAGLE_EYE, 'entities.eagleEye.errors.planLimitExceeded'),
    safeWrap(eagleEyeSettingsUpdate),
  )

  app.delete(
    `/tenant/:tenantId/eagleEyeContent/:contentId/action/:actionId`,
    featureFlagMiddleware(FeatureFlag.EAGLE_EYE, 'entities.eagleEye.errors.planLimitExceeded'),
    safeWrap(eagleEyeActionDestroy),
  )
}
