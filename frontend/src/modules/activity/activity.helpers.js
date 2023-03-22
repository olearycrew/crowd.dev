export function computedMessage(activity) {
  if (
    activity.platform === 'slack'
    && activity.type === 'message'
    && activity.thread
  ) {
    return `entities.activity.${activity.platform}.replied`;
  } if (
    activity.platform === 'discord'
    && activity.type === 'message'
    && activity.parentId
  ) {
    return activity.thread
      ? `entities.activity.${activity.platform}.replied_thread`
      : `entities.activity.${activity.platform}.replied`;
  } if (activity.platform === 'devto') {
    return `entities.activity.${activity.platform}.commented`;
  }
  return `entities.activity.${activity.platform}.${activity.type}`;
}

export function computedArgs(activity) {
  if (activity.type === 'hashtag' && activity.channel) {
    return [`#${activity.channel}`];
  }
  return [];
}
