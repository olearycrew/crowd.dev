import passport from 'passport'
import { safeWrap } from '../../middlewares/errorMiddleware'
import { API_CONFIG } from '../../conf'
import { authMiddleware } from '../../middlewares/authMiddleware'
import TenantService from '../../services/tenantService'
import { getSlackNotifierStrategy } from '../../services/auth/passportStrategies/slackStrategy'
import automationSlackConnect from './automationSlackConnect'
import automationSlackCallback from './automationSlackCallback'
import automationCreate from './automationCreate'
import automationUpdate from './automationUpdate'
import automationDestroy from './automationDestroy'
import automationExecutionFind from './automationExecutionFind'
import automationFind from './automationFind'
import automationList from './automationList'

export default (app) => {
  app.get('/tenant/:tenantId/automation/slack', safeWrap(automationSlackConnect))
  app.get(
    '/tenant/automation/slack/callback',
    passport.authorize(getSlackNotifierStrategy(), {
      session: false,
      failureRedirect: `${API_CONFIG.frontendUrl}/settings?activeTab=automations&error=true`,
    }),
    (req, _res, next) => {
      const { crowdToken } = JSON.parse(Buffer.from(req.query.state, 'base64').toString())
      req.headers.authorization = `Bearer ${crowdToken}`
      next()
    },
    authMiddleware,
    async (req, _res, next) => {
      const { tenantId } = JSON.parse(Buffer.from(req.query.state, 'base64').toString())
      req.currentTenant = await new TenantService(req).findById(tenantId)
      next()
    },
    safeWrap(automationSlackCallback),
  )
  app.post('/tenant/:tenantId/automation', safeWrap(automationCreate))
  app.put('/tenant/:tenantId/automation/:automationId', safeWrap(automationUpdate))
  app.delete('/tenant/:tenantId/automation/:automationId', safeWrap(automationDestroy))
  app.get(
    '/tenant/:tenantId/automation/:automationId/executions',
    safeWrap(automationExecutionFind),
  )
  app.get('/tenant/:tenantId/automation/:automationId', safeWrap(automationFind))
  app.get('/tenant/:tenantId/automation', safeWrap(automationList))
}
