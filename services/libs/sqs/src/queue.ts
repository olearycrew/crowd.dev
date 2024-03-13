import {
  ChangeMessageVisibilityRequest,
  CreateQueueCommand,
  DeleteMessageRequest,
  GetQueueUrlCommand,
  ReceiveMessageRequest,
  SendMessageBatchRequestEntry,
  SendMessageRequest,
} from '@aws-sdk/client-sqs'
import { IS_PROD_ENV, IS_STAGING_ENV, generateUUIDv1, timeout } from '@crowd/common'
import { Logger, LoggerBase } from '@crowd/logging'
import {
  deleteMessage,
  receiveMessage,
  sendMessage,
  sendMessagesBulk,
  changeMessageVisibility,
} from './client'
import { ISqsQueueConfig, SqsClient, SqsMessage, SqsQueueType } from './types'
import { IQueueMessage, ISqsQueueEmitter } from '@crowd/types'
import { Tracer } from '@crowd/tracing'
import { QueueObject, queue } from 'async'

export abstract class SqsQueueBase extends LoggerBase {
  private readonly queueName: string
  private queueUrl: string | undefined
  protected readonly isFifo: boolean
  tracer: Tracer

  constructor(
    protected readonly sqsClient: SqsClient,
    public readonly queueConf: ISqsQueueConfig,
    tracer: Tracer,
    parentLog: Logger,
  ) {
    super(parentLog, {
      queueName: queueConf.name,
      type: queueConf.type,
    })

    this.tracer = tracer
    this.isFifo = queueConf.type === SqsQueueType.FIFO

    let env = ''
    if (IS_STAGING_ENV) {
      env = '-staging'
    } else if (IS_PROD_ENV) {
      env = '-production'
    }

    if (this.isFifo) {
      this.queueName = `${queueConf.name}${env}.fifo`
    } else {
      this.queueName = `${queueConf.name}${env}`
    }
  }

  public isInitialized(): boolean {
    return this.queueUrl !== undefined
  }

  protected getQueueUrl(): string {
    if (this.queueUrl) {
      return this.queueUrl
    }

    throw new Error('Queue URL not set - please call init() first!')
  }

  public async init() {
    try {
      const cmd = new GetQueueUrlCommand({
        QueueName: this.queueName,
      })
      const result = await this.sqsClient.send(cmd)
      this.log.info('Queue exists!')
      this.queueUrl = result.QueueUrl
    } catch (err) {
      if (err.name === 'QueueDoesNotExist') {
        this.log.info('Queue does not exist, creating...')
        const createCommand = new CreateQueueCommand({
          QueueName: this.queueName,
          Attributes: {
            ReceiveMessageWaitTimeSeconds: `${this.queueConf.waitTimeSeconds}`,
            VisibilityTimeout: `${this.queueConf.visibilityTimeout}`,
            MessageRetentionPeriod: `${this.queueConf.messageRetentionPeriod}`,
            DelaySeconds: `${this.queueConf.deliveryDelay}`,
            ...(this.queueConf.type === SqsQueueType.FIFO && {
              FifoQueue: 'true',
              ContentBasedDeduplication: 'false',
              FifoThroughputLimit: this.queueConf.fifoThroughputLimit || 'perMessageGroupId',
              DeduplicationScope: this.queueConf.deduplicationScope || 'messageGroup',
            }),
          },
        })
        const result = await this.sqsClient.send(createCommand)
        this.queueUrl = result.QueueUrl
        this.log.info('Queue created!')
      } else {
        this.log.error(err, 'Error checking if queue exists!')
        throw err
      }
    }
  }
}

export abstract class SqsQueueReceiver extends SqsQueueBase {
  private started = false
  private queue: QueueObject<{ data: IQueueMessage; receiptHandle?: string }>

  constructor(
    sqsClient: SqsClient,
    queueConf: ISqsQueueConfig,
    private readonly maxConcurrentMessageProcessing: number,
    tracer: Tracer,
    parentLog: Logger,
    private readonly deleteMessageImmediately = false,
    private readonly visibilityTimeoutSeconds?: number,
    private readonly receiveMessageCount?: number,
  ) {
    super(sqsClient, queueConf, tracer, parentLog)
  }

  public async start(): Promise<void> {
    await this.init()

    const log = this.log
    this.queue = queue(async (msg, complete) => {
      try {
        await this.processMessage(msg.data, msg.receiptHandle)
      } catch (err) {
        log.error(err, 'Error while processing message!')
      }

      if (!this.deleteMessageImmediately) {
        try {
          await this.deleteMessage(msg.receiptHandle)
        } catch (err) {
          log.error(err, 'Error while deleting a message!')
        }
      }

      complete()
    })

    this.started = true

    process.on('SIGTERM', async () => {
      await this.stop()
    })

    this.log.info({ url: this.getQueueUrl() }, 'Starting listening to queue...')
    while (this.started) {
      if (this.queue.length() < 10) {
        const messages = await this.receiveMessage()
        if (messages.length > 0) {
          for (const message of messages) {
            this.queue.push({
              data: JSON.parse(message.Body),
              receiptHandle: message.ReceiptHandle,
            })

            if (this.deleteMessageImmediately) {
              await this.deleteMessage(message.ReceiptHandle)
            }
          }
        } else {
          await timeout(200)
        }
      } else {
        this.log.trace('Queue is busy, waiting...')
        await timeout(50)
      }
    }
  }

  public async stop() {
    this.log.warn('Stopping processing...')
    this.started = false

    if (this.queue) {
      await this.queue.drain()
    }
  }

  protected abstract processMessage(data: IQueueMessage, receiptHandle?: string): Promise<void>

  private async receiveMessage(): Promise<SqsMessage[]> {
    try {
      const params: ReceiveMessageRequest = {
        QueueUrl: this.getQueueUrl(),
      }

      return receiveMessage(
        this.sqsClient,
        params,
        this.visibilityTimeoutSeconds,
        this.receiveMessageCount,
      )
    } catch (err) {
      if (err.message === 'Request is throttled.') {
        return []
      }

      throw err
    }
  }

  private async deleteMessage(receiptHandle: string): Promise<void> {
    const params: DeleteMessageRequest = {
      QueueUrl: this.getQueueUrl(),
      ReceiptHandle: receiptHandle,
    }

    return deleteMessage(this.sqsClient, params)
  }
}

export class SqsQueueEmitter extends SqsQueueBase implements ISqsQueueEmitter {
  constructor(sqsClient: SqsClient, queueConf: ISqsQueueConfig, tracer: Tracer, parentLog: Logger) {
    super(sqsClient, queueConf, tracer, parentLog)
  }

  public async sendMessage<T extends IQueueMessage>(
    groupId: string,
    message: T,
    deduplicationId?: string,
  ): Promise<void> {
    let MessageDeduplicationId: string | undefined
    if (this.isFifo) {
      MessageDeduplicationId = deduplicationId || `${groupId}-${new Date().getTime()}`
    }
    const params: SendMessageRequest = {
      QueueUrl: this.getQueueUrl(),
      MessageGroupId: groupId,
      MessageDeduplicationId,
      MessageBody: JSON.stringify(message),
    }

    await sendMessage(this.sqsClient, params)
  }

  public async sendMessages<T extends IQueueMessage>(
    messages: { payload: T; groupId: string; deduplicationId?: string; id?: string }[],
  ): Promise<void> {
    if (messages.length > 10) {
      throw new Error('Maximum number of messages to send is 10!')
    }
    const time = new Date().getTime()

    const entries: SendMessageBatchRequestEntry[] = messages.map((msg) => {
      return {
        Id: msg.id || generateUUIDv1(),
        MessageBody: JSON.stringify(msg.payload),
        MessageDeduplicationId: this.isFifo
          ? msg.deduplicationId || `${msg.groupId}-${time}`
          : undefined,
        MessageGroupId: msg.groupId,
      }
    })

    await sendMessagesBulk(this.sqsClient, {
      QueueUrl: this.getQueueUrl(),
      Entries: entries,
    })
  }

  public async setMessageVisibilityTimeout(
    receiptHandle: string,
    newVisibility: number,
  ): Promise<void> {
    const params: ChangeMessageVisibilityRequest = {
      QueueUrl: this.getQueueUrl(),
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: newVisibility,
    }
    await changeMessageVisibility(this.sqsClient, params)
  }
}
