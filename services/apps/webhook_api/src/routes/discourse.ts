import { asyncWrap } from '../middleware/error'
import { WebhooksRepository } from '../repos/webhooks.repo'
import { Error400BadRequest } from '@crowd/common'
import { getServiceTracer } from '@crowd/tracing'
import { IntegrationStreamWorkerEmitter } from '@crowd/sqs'
import { PlatformType, WebhookType } from '@crowd/types'
import express from 'express'
import { verifyWebhookSignature } from 'utils/crypto'

const tracer = getServiceTracer()

export const installDiscourseRoutes = async (app: express.Express) => {
  let emitter: IntegrationStreamWorkerEmitter
  app.post(
    '/discourse/:tenantId/',
    asyncWrap(async (req, res) => {
      const signature = req.headers['x-discourse-event-signature']
      if (!signature) {
        throw new Error400BadRequest('Missing signature header!')
      }

      const eventId = req.headers['x-discourse-event-id']
      const eventType = req.headers['x-discourse-event-type']
      const event = req.headers['x-discourse-event']
      const data = req.body

      const repo = new WebhooksRepository(req.dbStore, req.log)
      const integration = await repo.findIntegrationByPlatformAndTenantId(
        PlatformType.DISCOURSE,
        req.params.tenantId,
      )

      if (integration) {
        req.log.info({ integrationId: integration.id }, 'Incoming Discourse Webhook!')

        if (
          !verifyWebhookSignature(
            JSON.stringify(data),
            integration.settings.webhookSecret,
            signature as string,
          )
        ) {
          req.log.warn({ signature }, 'Discourse Webhook signature verification failed!')
          res.sendStatus(200)
          return
        }

        const id = await repo.createIncomingWebhook(
          integration.tenantId,
          integration.id,
          WebhookType.DISCOURSE,
          {
            signature,
            eventId,
            eventType,
            event,
            data,
            date: new Date().toISOString(),
          },
        )

        if (!emitter) {
          emitter = new IntegrationStreamWorkerEmitter(req.sqs, tracer, req.log)
          await emitter.init()
        }

        await emitter.triggerWebhookProcessing(integration.tenantId, integration.platform, id)

        res.sendStatus(204)
      } else {
        req.log.warn(
          { tenantId: req.params.tenantId },
          'Discourse integration not found for incoming webhook!',
        )
        res.sendStatus(200)
      }
    }),
  )
}
