import { ProcessStreamHandler } from '@/types'
/**
 * Get a hashtag for `attributes.hashtag`
 * @param endpoint The current endpoint
 * @returns The name of the hashtag
 */
function getHashtag(endpoint: string): string {
  return endpoint.includes('#')
    ? endpoint.slice(endpoint.indexOf('#') + 1)
    : endpoint.slice(endpoint.indexOf('/') + 1)
}

/**
 * Map a field of activities given a path
 * - ([{attributes: 1}, {attributes: 2}], attributes) => [1, 2]
 * @param activities Array of activities to be mapped
 * @param path Path to the field of the activity we want
 * @returns A list of the values of the field of the activities
 */
function mapToPath(activities: Array<any>, path: string) {
  return activities.map((activity) => {
    return path.split('.').reduce((acc, part) => {
      return acc && acc[part]
    }, activity)
  })
}

/**
 * Checks whether any element of the array is the same of any element in the set
 * @param set Set of elements
 * @param array Array of elements
 * @returns Boolean
 */
function isJoin(set: Set<any>, array: Array<any>): boolean {
  const arrayToSet = new Set(array)
  return new Set([...set, ...arrayToSet]).size !== set.size + arrayToSet.size
}

/**
 * Get the usecase for the given endpoint with its main argument
 * @param stream The stream we are currently targeting
 * @param profileId The ID of the profile we are getting data for
 * @returns The function to call, as well as its main argument
 */
function getUsecase(
  stream: string,
  profileId: string,
): {
  fn
  arg: any
} {
  switch (stream) {
    case 'followers':
      return { fn: getFollowers, arg: { profileId } }
    case 'mentions':
      return { fn: findPostsByMention, arg: { profileId } }
    default: {
      const hashtag = stream.includes('#')
        ? stream.slice(stream.indexOf('#') + 1)
        : stream.slice(stream.indexOf('/') + 1)
      return { fn: findPostsByHashtag, arg: { hashtag } }
    }
  }
}

export const processStream: ProcessStreamHandler = async (ctx) => {
  //
}
