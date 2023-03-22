<template>
  <slot :connect="connect" />
  <app-devto-connect-drawer
    v-model="drawerVisible"
    :integration="integration"
  />
</template>

<script>
</script>
<script setup>
import { defineProps, ref } from 'vue';
import AppDevtoConnectDrawer from '@/integrations/devto/components/devto-connect-drawer';

export default {
  name: 'AppDevtoConnect',
};

defineProps({
  integration: {
    type: Object,
    default: () => {},
  },
});

const connect = () => {
  drawerVisible.value = true;
};

const drawerVisible = ref(false);
</script>
