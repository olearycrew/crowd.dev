import HackerNewsConnect from './components/hackerNews-connect.vue'
import HackerNewsActivityMessage from './components/activity/hackerNews-activity-message.vue'
import HackerNewsActivityContent from './components/activity/hackerNews-activity-content.vue'

export default {
  enabled: true,
  name: 'Hacker News',
  backgroundColor: '#ffdecf',
  borderColor: '#ffdecf',
  description:
    'Connect Hacker News to get posts as well as their comments mentioning your community.',
  image: '/images/integrations/hackernews.svg',
  connectComponent: HackerNewsConnect,
  activityMessage: HackerNewsActivityMessage,
  activityContent: HackerNewsActivityContent
}
