// types.ts content
export enum GroupsioActivityType {}

export type GroupName = `${string}@groups.io`

export enum GroupsioStreamType {
  GROUP = 'group',
  TOPIC = 'topic',
}

export interface GroupsioGroupStreamMetadata {
  group: GroupName
  page: string | null
}

export interface GroupsioTopicStreamMetadata {
  topic: Topic
  page: string | null
}

export interface GroupsioIntegrationSettings {
  email: string
  token: string
  groups: GroupName[]
}

export interface Topic {
  id: number
  object: 'topic'
  created: string
  updated: string
  group_id: number
  group_subject_tag: string
  subject: string
  summary: string
  name: string
  profile_photo_url: string
  num_messages: number
  is_sticky: boolean
  is_moderated: boolean
  is_closed: boolean
  has_attachments: boolean
  reply_to: string
  most_recent_message: string
  hashtags: null | string[]
}

export interface ListBase {
  object: 'list'
  total_count: number
  start_item: number
  end_item: number
  has_more: boolean
  next_page_token: number
  sort_field: string
  second_order: string
  query: string
  sort_dir: 'asc' | 'desc'
}

export interface ListTopics extends ListBase {
  data: Topic[]
}

export interface ListMessages extends ListBase {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  group_perms?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  group?: any
  cover_photo_url?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sub_data?: any
}
