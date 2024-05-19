import { IOrganizationIdentity } from '@crowd/types'

export interface IQueryNumberOfNewOrganizations {
  tenantId: string
  after?: Date
  before?: Date
}

export interface IOrganizationPartialAggregatesRawResult {
  id: string
  identities: IOrganizationIdentity[]
  noMergeIds: string[]
  displayName: string

  location: string
  industry: string
  website: string
  ticker: string
  activityCount: number
}
