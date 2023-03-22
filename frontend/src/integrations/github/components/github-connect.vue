<template>
  <slot :connect="connect" />
</template>

<script>
</script>
<script setup>
import { defineProps, computed } from 'vue';
import config from '@/config';

export default {
  name: 'AppGithubConnect',
};

defineProps({
  integration: {
    type: Object,
    default: () => {},
  },
});

const connect = () => {
  window.open(githubConnectUrl.value, '_self');
};

const githubConnectUrl = computed(() =>
  // We have 3 GitHub apps: test, test-local and prod
  // Getting the proper URL from config file
  config.gitHubInstallationUrl);
</script>
