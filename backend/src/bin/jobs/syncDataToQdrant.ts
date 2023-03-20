import { Op } from 'sequelize'
import SequelizeRepository from '../../database/repositories/sequelizeRepository'
import { CrowdJob } from '../../types/jobTypes'
import { sendNodeWorkerMessage } from '../../serverless/utils/nodeWorkerSQS'
import { NodeWorkerMessageType } from '../../serverless/types/workerTypes'
import { NodeWorkerMessageBase } from '../../types/mq/nodeWorkerMessageBase'

const job: CrowdJob = {
  name: 'Sync data to Qdrant',
  // every hour
  cronTime: '0 * * * *',
  onTrigger: async () => {
    const options = await SequelizeRepository.getDefaultIRepositoryOptions()

    const allSettings = await options.database.settings.findAll({
      where: {
        aiSupportSettings: {
          [Op.not]: {
            [Op.eq]: {},
          },
        },
      },
    })

    for (const settings of allSettings) {
      await sendNodeWorkerMessage(settings.id, {
        tenantId: settings.tenantId,
        type: NodeWorkerMessageType.NODE_MICROSERVICE,
        service: 'qdrant-sync',
      } as NodeWorkerMessageBase)
    }
  },
}

export default job
