<template>
  <div class="flex items-center h-screen">
    <div
      v-loading="true"
      class="app-page-spinner h-14"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { Auth0Service } from '@/shared/services/auth0.service';
import { mapActions } from '@/shared/vuex/vuex.helpers';
import { useRoute, useRouter } from 'vue-router';

const { doSigninWithAuth0 } = mapActions('auth');

const router = useRouter();
const route = useRoute();

onMounted(() => {
  const { code, state } = route.query;
  Auth0Service.handleAuth()
    .then(() => {
      const { idToken, profile } = Auth0Service.authData();
    });
});
</script>

<script lang="ts">
export default {
  name: 'AppAuthCallback',
};
</script>
