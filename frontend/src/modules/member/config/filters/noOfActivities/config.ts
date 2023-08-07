import { FilterConfigType } from '@/shared/modules/filters/types/FilterConfig';
import { CustomFilterConfig } from '@/shared/modules/filters/types/filterTypes/CustomFilterConfig';
import NoOfActivitiesFilter from '@/modules/member/config/filters/noOfActivities/NoOfActivitiesFilter.vue';
import { FilterNumberOperator } from '@/shared/modules/filters/config/constants/number.constants';
import { NoOfActivitiesForm } from "@/modules/member/config/filters/noOfActivities/types";

const noOfActivities: CustomFilterConfig = {
  id: 'noOfActivities',
  label: '# of activities',
  iconClass: 'ri-radar-line',
  type: FilterConfigType.CUSTOM,
  component: NoOfActivitiesFilter,
  options: {},
  queryUrlParser: (query: any): NoOfActivitiesForm => {
    const obj: any = {
      operator: query.operator as any,
      value: +query.value,
      valueTo: +query.valueTo || '',
    };
    if (![FilterNumberOperator.BETWEEN, FilterNumberOperator.NOT_BETWEEN].includes(obj.operator)) {
      delete obj.valueTo;
    }
    return obj;
  },
  itemLabelRenderer(value: any, options: any): string {
    console.log(value, options);
    return 'no of activities';
  },
  apiFilterRenderer(value: any): any[] {
    console.log(value);
    return [];
  },
};

export default noOfActivities;
