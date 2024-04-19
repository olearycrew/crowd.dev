import { FeatureFlag } from '@crowd/types'
import { safeWrap } from '../../../middlewares/errorMiddleware'
import { featureFlagMiddleware } from '../../../middlewares/featureFlagMiddleware'
import memberEnrichBulk from './memberEnrichBulk'
import memberEnrich from './memberEnrich'

export default (app) => {
  app.put(
    `/tenant/:tenantId/enrichment/member/bulk`,
    featureFlagMiddleware(FeatureFlag.MEMBER_ENRICHMENT, 'enrichment.errors.planLimitExceeded'),
    safeWrap(memberEnrichBulk),
  )
  app.put(
    `/tenant/:tenantId/enrichment/member/:id/`,
    featureFlagMiddleware(FeatureFlag.MEMBER_ENRICHMENT, 'enrichment.errors.planLimitExceeded'),
    safeWrap(memberEnrich),
  )
}
