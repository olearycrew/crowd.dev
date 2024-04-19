import { FeatureFlag } from '@crowd/types'
import { safeWrap } from '../../middlewares/errorMiddleware'
import { featureFlagMiddleware } from '../../middlewares/featureFlagMiddleware'
import organizationCreate from './organizationCreate'
import organizationQuery from './organizationQuery'
import organizationUpdate from './organizationUpdate'
import organizationImport from './organizationImport'
import organizationDestroy from './organizationDestroy'
import organizationAutocomplete from './organizationAutocomplete'
import organizationList from './organizationList'
import organizationActiveList from './organizationActiveList'
import organizationFind from './organizationFind'
import organizationMerge from './organizationMerge'
import organizationNotMerge from './organizationNotMerge'
import organizationUnmergePreview from './organizationUnmergePreview'
import organizationUnmerge from './organizationUnmerge'
import organizationExport from './organizationExport'
import organizationByIds from './organizationByIds'

export default (app) => {
  app.post(`/tenant/:tenantId/organization`, safeWrap(organizationCreate))
  app.post(`/tenant/:tenantId/organization/query`, safeWrap(organizationQuery))
  app.put(`/tenant/:tenantId/organization/:id`, safeWrap(organizationUpdate))
  app.post(`/tenant/:tenantId/organization/import`, safeWrap(organizationImport))
  app.delete(`/tenant/:tenantId/organization`, safeWrap(organizationDestroy))
  app.post(`/tenant/:tenantId/organization/autocomplete`, safeWrap(organizationAutocomplete))
  app.get(`/tenant/:tenantId/organization`, safeWrap(organizationList))
  app.get(`/tenant/:tenantId/organization/active`, safeWrap(organizationActiveList))
  app.get(`/tenant/:tenantId/organization/:id`, safeWrap(organizationFind))
  app.put(`/tenant/:tenantId/organization/:organizationId/merge`, safeWrap(organizationMerge))
  app.put(`/tenant/:tenantId/organization/:organizationId/no-merge`, safeWrap(organizationNotMerge))
  app.post(
    `/tenant/:tenantId/organization/:organizationId/unmerge/preview`,
    safeWrap(organizationUnmergePreview),
  )
  app.post(`/tenant/:tenantId/organization/:organizationId/unmerge`, safeWrap(organizationUnmerge))
  app.post(
    `/tenant/:tenantId/organization/export`,
    featureFlagMiddleware(FeatureFlag.CSV_EXPORT, 'errors.csvExport.planLimitExceeded'),
    safeWrap(organizationExport),
  )
  app.post(`/tenant/:tenantId/organization/id`, safeWrap(organizationByIds))
}
