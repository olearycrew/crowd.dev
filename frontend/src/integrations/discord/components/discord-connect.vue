<template>
  <slot :connect="connect" />
</template>

<script>
</script>
<script setup>
import { defineProps, computed } from 'vue';
import config from '@/config';

export default {
  name: 'AppIntegrationDiscord',
};

defineProps({
  integration: {
    type: Object,
    default: () => {},
  },
});

const connect = () => {
  window.open(connectUrl.value, '_self');
};

const connectUrl = computed(() => config.discordInstallationUrl);
</script>
