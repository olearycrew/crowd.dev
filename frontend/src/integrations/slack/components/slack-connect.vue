<template>
  <slot :connect="connect" />
</template>

<script>
</script>
<script setup>
import { useStore } from 'vuex';
import { defineProps, computed } from 'vue';
import config from '@/config';
import { AuthToken } from '@/modules/auth/auth-token';

export default {
  name: 'AppSlackConnect',
};

const store = useStore();
defineProps({
  integration: {
    type: Object,
    default: () => {},
  },
});

const connect = () => {
  window.open(connectUrl.value, '_self');
};

const connectUrl = computed(() => {
  const redirectUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?success=true`;

  return `${config.backendUrl}/slack/${
    store.getters['auth/currentTenant'].id
  }/connect?redirectUrl=${redirectUrl}&crowdToken=${AuthToken.get()}`;
});
</script>
