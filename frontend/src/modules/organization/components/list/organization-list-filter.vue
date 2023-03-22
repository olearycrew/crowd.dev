<template>
  <div class="organization-filter">
    <app-filter-list
      module="organization"
      placeholder="Search organizations..."
      :search-filter="organizationSearch"
    >
      <template #dropdown>
        <app-filter-dropdown
          module="organization"
          :attributes="organizationAttributes"
        />
      </template>
    </app-filter-list>
  </div>
</template>

<script>
</script>

<script setup>
import { computed } from 'vue';
import { OrganizationModel } from '@/modules/organization/organization-model';

export default {
  name: 'AppOrganizationListFilter',
};

const organizationAttributes = Object.values(
  OrganizationModel.fields,
).filter((f) => f.filterable);

const organizationSearch = computed(() => OrganizationModel.fields.search.forFilter());
</script>

<style></style>
