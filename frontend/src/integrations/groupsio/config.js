import config from '@/config';

export default {
  enabled: config.isGroupsioIntegrationEnabled,
  hideAsIntegration: !config.isGroupsioIntegrationEnabled,
  name: 'groups.io',
  backgroundColor: '#FFFFFF',
  borderColor: '#FFFFFF',
  description:
    'Connect your groups.io account to receive notifications about new messages and threads.',
  image:
    '/images/integrations/groupsio.jpeg',
};
