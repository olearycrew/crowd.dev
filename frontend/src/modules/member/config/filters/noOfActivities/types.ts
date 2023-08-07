import { NumberFilterValue } from '@/shared/modules/filters/types/filterTypes/NumberFilterConfig';

export enum NoOfActivitiesDateType {
  ALL_TIME = 'all-time',
  LAST_24_HOURS = 'last-24-hours',
  LAST_7_DAYS = 'last-7-days',
  LAST_14_DAYS = 'last-14-days',
  LAST_30_DAYS = 'last-30-days',
  LAST_90_DAYS = 'last-90-days',
  CUSTOM = 'custom',
}

export enum NoOfActivitiesDateOperator {
  IS = 'is',
  IS_BEFORE = 'is-before',
  IS_AFTER = 'is-after',
  BETWEEN = 'between',
}

export interface NoOfActivitiesForm extends NumberFilterValue {
  dateType: NoOfActivitiesDateType;
  dateOperator: NoOfActivitiesDateOperator;
  date: string;
}
