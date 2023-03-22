<template>
  <slot :connect="connect" />
  <app-hackerNews-connect-drawer
    v-model="drawerVisible"
    :integration="integration"
  />
</template>

<script>
</script>
<script setup>
import { defineProps, ref } from 'vue';
import AppHackerNewsConnectDrawer from '@/integrations/hackernews/components/hackerNews-connect-drawer';

export default {
  name: 'AppHackerNewsConnect',
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
