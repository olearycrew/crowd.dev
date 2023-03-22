<template>
  <div>
    <component
      :is="customComponent"
      :class="`member-display-name ${customClass}`"
      :to="
        withLink
          ? {
            name: 'memberView',
            params: { id: member.id },
          }
          : null
      "
    >
      {{ member.displayName }}
    </component>
    <app-member-badge v-if="showBadge" :member="member" />
  </div>
</template>

<script>
</script>
<script setup>
import { defineProps } from 'vue';
import AppMemberBadge from '@/modules/member/components/member-badge';

export default {
  name: 'AppMemberDisplayName',
};

const props = defineProps({
  member: {
    type: Object,
    default: () => {},
  },
  showBadge: {
    type: Boolean,
    required: false,
    default: true,
  },
  withLink: {
    type: Boolean,
    default: false,
  },
  customClass: {
    type: String,
    default: null,
  },
});

const customComponent = props.withLink
  ? 'router-link'
  : 'span';
</script>
