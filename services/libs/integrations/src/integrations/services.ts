import { getServiceChildLogger } from '@crowd/logging'
import fs from 'fs'
import { IIntegrationDescriptor } from '../types'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const log = getServiceChildLogger('integrations')

export const INTEGRATION_SERVICES: IIntegrationDescriptor[] = []

const intFolder = resolve(`${__dirname}/`)

const integrationFolders = fs
  .readdirSync(intFolder, { withFileTypes: true })
  .filter(
    (dir) =>
      dir.isDirectory() &&
      dir.name !== 'premium' &&
      fs.existsSync(`${intFolder}/${dir.name}/index.ts`),
  )

for (const intFolder of integrationFolders) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const module = await import(`./${intFolder.name}`)
  INTEGRATION_SERVICES.push(module.default)
}

// add premium integrations - check for js because library is compiled to javascript
const premiumFolder = resolve(`${__dirname}/premium`)

if (fs.existsSync(premiumFolder)) {
  const premiumIntFolders = fs
    .readdirSync(premiumFolder, { withFileTypes: true })
    .filter((dir) => dir.isDirectory() && fs.existsSync(`${premiumFolder}/${dir.name}/index.ts`))

  if (premiumIntFolders.length > 0) {
    for (const premiumIntFolder of premiumIntFolders) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const module = await import(`./premium/${premiumIntFolder.name}`)
      INTEGRATION_SERVICES.push(module.default)
    }
  }
}

log.info(
  { types: INTEGRATION_SERVICES.map((i) => i.type) },
  `Loaded ${INTEGRATION_SERVICES.length} integrations`,
)
