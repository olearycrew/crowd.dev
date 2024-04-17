import lodash from 'lodash'
import GoogleStrategy from 'passport-google-oauth20'
import { getServiceChildLogger } from '@crowd/logging'
import { AuthProvider } from '@crowd/types'
import { GOOGLE_CONFIG } from '../../../conf'
import { databaseInit } from '../../../database/databaseConnection'
import AuthService from '../authService'
import { splitFullName } from '../../../utils/splitName'

const log = getServiceChildLogger('AuthSocial')

export function getGoogleStrategy(): GoogleStrategy {
  return new GoogleStrategy(
    {
      clientID: GOOGLE_CONFIG.clientId,
      clientSecret: GOOGLE_CONFIG.clientSecret,
      callbackURL: GOOGLE_CONFIG.callbackUrl,
    },
    (accessToken, refreshToken, profile, done) => {
      databaseInit()
        .then((database) => {
          const email = lodash.get(profile, 'emails[0].value')
          const emailVerified = lodash.get(profile, 'emails[0].verified', false)
          const displayName = lodash.get(profile, 'displayName')
          const { firstName, lastName } = splitFullName(displayName)

          return AuthService.signinFromSocial(
            AuthProvider.GOOGLE,
            profile.id,
            email,
            emailVerified,
            firstName,
            lastName,
            displayName,
            { database },
          )
        })
        .then((jwtToken) => {
          done(null, jwtToken)
        })
        .catch((error) => {
          log.error(error, 'Error while handling google auth!')
          done(error, null)
        })
    },
  )
}
