<template>
  <img
    v-lazy="src"
    lazy="loading"
    class="object-cover object-center"
    :alt="alt"
  />
</template>

<script>
</script>

<script setup>
import { defineProps } from 'vue';

export default {
  name: 'AppImage',
};

defineProps({
  src: {
    type: String,
    required: true,
  },
  alt: {
    type: String,
    required: true,
  },
});
</script>

<style lang="scss" scoped>
img[lazy='loading'] {
  @apply w-full bg-gray-200 animate-pulse;
}
</style>
