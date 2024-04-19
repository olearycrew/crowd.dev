import { createRateLimiter } from '../apiRateLimiter'
import { safeWrap } from '../../middlewares/errorMiddleware'
import authPasswordReset from './authPasswordReset'
import authSendEmailAddressVerificationEmail from './authSendEmailAddressVerificationEmail'
import authSendPasswordResetEmail from './authSendPasswordResetEmail'
import authSignIn from './authSignIn'
import authSignUp from './authSignUp'
import authUpdateProfile from './authUpdateProfile'
import authPasswordChange from './authPasswordChange'
import authVerifyEmail from './authVerifyEmail'
import authMe from './authMe'
import ssoCallback from './ssoCallback'

export default (app) => {
  app.put(`/auth/password-reset`, safeWrap(authPasswordReset))

  const emailRateLimiter = createRateLimiter({
    max: 6,
    windowMs: 15 * 60 * 1000,
    message: 'errors.429',
  })

  app.post(
    `/auth/send-email-address-verification-email`,
    emailRateLimiter,
    safeWrap(authSendEmailAddressVerificationEmail),
  )

  app.post(
    `/auth/send-password-reset-email`,
    emailRateLimiter,
    safeWrap(authSendPasswordResetEmail),
  )

  const signInRateLimiter = createRateLimiter({
    max: 100,
    windowMs: 15 * 60 * 1000,
    message: 'errors.429',
  })

  app.post(`/auth/sign-in`, signInRateLimiter, safeWrap(authSignIn))

  const signUpRateLimiter = createRateLimiter({
    max: 20,
    windowMs: 60 * 60 * 1000,
    message: 'errors.429',
  })

  app.post(`/auth/sign-up`, signUpRateLimiter, safeWrap(authSignUp))

  app.put(`/auth/profile`, safeWrap(authUpdateProfile))

  app.put(`/auth/change-password`, safeWrap(authPasswordChange))

  app.put(`/auth/verify-email`, safeWrap(authVerifyEmail))

  app.get(`/auth/me`, safeWrap(authMe))

  app.post(`/auth/sso/callback`, safeWrap(ssoCallback))
}
