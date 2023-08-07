<template>
  <div>
    <cr-number-filter v-model="form" :config="props.config as NumberFilterConfig" />
    <div class="-mt-1 px-4 pb-8">
      <p class="text-xs text-gray-500 mb-1.5">
        When
      </p>
      <el-select v-model="form.dateType" class="w-full mb-4" :teleported="false">
        <el-option
          v-for="type of dateTypeOptions"
          :key="type"
          :value="type.value"
          :label="type.label"
        />
      </el-select>
      <!--      <div class="flex items-center" v-if="form.dateType === NoOfActivitiesDateType.CUSTOM">-->
      <div class="flex items-center">
        <el-select v-model="form.dateOperator" class="mb-4" :teleported="false">
          <el-option
            v-for="type of dateOperatorOptions"
            :key="type"
            :value="type.value"
            :label="type.label"
          />
        </el-select>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineEmits, defineProps } from 'vue';
import { CustomFilterConfig } from '@/shared/modules/filters/types/filterTypes/CustomFilterConfig';
import CrNumberFilter from '@/shared/modules/filters/components/filterTypes/NumberFilter.vue';
import { NumberFilterConfig } from '@/shared/modules/filters/types/filterTypes/NumberFilterConfig';
import {
  NoOfActivitiesDateOperator,
  NoOfActivitiesDateType,
  NoOfActivitiesForm,
} from '@/modules/member/config/filters/noOfActivities/types';

const props = defineProps<{
  modelValue: NoOfActivitiesForm
  config: CustomFilterConfig,
  data: any,
}>();

const emit = defineEmits<{(e: 'update:modelValue', value: NoOfActivitiesForm), (e: 'update:data', value: any),}>();

const form = computed<NoOfActivitiesForm>({
  get: () => props.modelValue,
  set: (value: NoOfActivitiesForm) => emit('update:modelValue', value),
});

const dateTypeOptions = computed(() => Object.values(NoOfActivitiesDateType).map((value: string) => {
  const text = value.replaceAll('-', ' ');
  const label = text.charAt(0).toUpperCase() + text.substring(1).toLowerCase();

  return {
    value,
    label,
  };
}));

const dateOperatorOptions = computed(() => Object.values(NoOfActivitiesDateOperator).map((value: string) => {
  const text = value.replaceAll('-', ' ');
  const label = text.charAt(0).toUpperCase() + text.substring(1).toLowerCase();

  return {
    value,
    label,
  };
}));

</script>
