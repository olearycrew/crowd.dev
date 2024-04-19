import { Error400, Error403 } from '@crowd/common'
import { TenantPlans } from '@crowd/types'
import { PLANS_CONFIG } from '../../../conf'
import TenantService from '../../../services/tenantService'
import { tenantSubdomain } from '../../../services/tenantSubdomain'
import Stripe from 'stripe'

export default async (req, res) => {
  if (!PLANS_CONFIG.stripeSecretKey) {
    throw new Error400(req.language, 'tenant.stripeNotConfigured')
  }

  const stripe = new Stripe(PLANS_CONFIG.stripeSecretKey, {
    apiVersion: '2022-08-01',
  })

  const { currentTenant } = req
  const { currentUser } = req

  if (!currentTenant || !currentUser) {
    throw new Error403(req.language)
  }

  if (
    currentTenant.plan !== TenantPlans.Essential &&
    currentTenant.planStatus !== 'cancel_at_period_end' &&
    currentTenant.planUserId !== currentUser.id
  ) {
    throw new Error403(req.language)
  }

  let { planStripeCustomerId } = currentTenant

  if (!planStripeCustomerId || currentTenant.planUserId !== currentUser.id) {
    const stripeCustomer = await stripe.customers.create({
      email: currentUser.email,
      metadata: {
        tenantId: currentTenant.id,
      },
    })

    planStripeCustomerId = stripeCustomer.id
  }

  await new TenantService(req).updatePlanUser(
    currentTenant.id,
    planStripeCustomerId,
    currentUser.id,
  )

  const session = await stripe.billingPortal.sessions.create({
    customer: planStripeCustomerId,
    return_url: `${tenantSubdomain.frontendUrl(currentTenant)}/plan`,
  })

  await req.responseHandler.success(req, res, session)
}
