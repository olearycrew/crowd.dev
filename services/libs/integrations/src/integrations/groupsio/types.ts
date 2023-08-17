// types.ts content
export enum GroupsioActivityType {}

export type GroupName = `${string}@groups.io`

export enum GroupsioStreamType {
  GROUP = 'group',
}

export interface GroupsioGroupStreamMetadata {
  group: GroupName
}

export interface GroupsioIntegrationSettings {
  email: string
  token: string
  groups: GroupName[]
}
