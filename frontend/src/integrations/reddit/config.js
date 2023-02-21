import RedditConnect from './components/reddit-connect.vue'
import RedditActivityMessage from '@/integrations/reddit/components/activity/reddit-activity-message.vue'
import RedditActivityContent from '@/integrations/reddit/components/activity/reddit-activity-content.vue'

export default {
  enabled: true,
  name: 'Reddit',
  backgroundColor: '#ffd8ca',
  borderColor: '#ffd8ca',
  description:
    'Connect Reddit to sync posts and comments from selected subreddits.',
  image: '/images/integrations/reddit.svg',
  connectComponent: RedditConnect,
  activityMessage: RedditActivityMessage,
  activityContent: RedditActivityContent
}
