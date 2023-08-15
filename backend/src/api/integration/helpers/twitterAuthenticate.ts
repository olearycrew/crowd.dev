import passport from 'passport'
import { PlatformType } from '@crowd/types'
import Permissions from '../../../security/permissions'
import PermissionChecker from '../../../services/user/permissionChecker'
import SequelizeRepository from '../../../database/repositories/sequelizeRepository'

const delimeter = ';'
const delimeter2 = '*'

export const customTwitterEncode = (state: object) => {
  // let's costruct a string in the format of
  // tenantId:<tenantId>delimetersegmentIds:<segmentIds>delimeterredirectUrl:<redirectUrl>delimeterhashtags:<hashtags>delimetercrowdToken:<crowdToken>delimeterplatform:<platform>delimeteruserId:<userId>
  const stateString = Object.keys(state)
    .map((key) => `${key}${delimeter2}${state[key]}`)
    .join(delimeter)

  return stateString
}

export const customTwitterDecode = (stateString: string): object => {
  const state = stateString.split(delimeter).reduce((acc, curr) => {
    const [key, value] = curr.split(delimeter2)
    return { ...acc, [key]: JSON.stringify(value) }
  }, {})
  return state
}

export default async (req, res, next) => {
  // Checking we have permision to edit the project
  new PermissionChecker(req).validateHas(Permissions.values.integrationEdit)

  const state = {
    tenantId: req.params.tenantId,
    segmentIds: SequelizeRepository.getSegmentIds(req),
    redirectUrl: req.query.redirectUrl,
    hashtags: req.query.hashtags ? req.query.hashtags : '',
    crowdToken: req.query.crowdToken,
    platform: PlatformType.TWITTER,
    userId: req.currentUser.id,
  }

  const authenticator = passport.authenticate('twitter', {
    scope: ['tweet.read', 'tweet.write', 'users.read', 'follows.read', 'offline.access'],
    state: customTwitterEncode(state),
  })

  authenticator(req, res, next)
}
