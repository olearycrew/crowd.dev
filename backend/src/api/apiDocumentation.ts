import { API_CONFIG } from '../conf'

import express from 'express'
import fs from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default async function setupSwaggerUI(app) {
  if (API_CONFIG.documentation) {
    return
  }

  const serveSwaggerDef = function serveSwaggerDef(req, res) {
    res.sendFile(resolve(`${__dirname}/../documentation/openapi.json`))
  }
  app.get('/documentation-config', serveSwaggerDef)

  const module = await import('swagger-ui-dist')

  const swaggerUiAssetPath = module.default.getAbsoluteFSPath()
  const swaggerFiles = express.static(swaggerUiAssetPath)

  const urlRegex = /url: "[^"]*",/

  const patchIndex = function patchIndex(req, res) {
    const indexContent = fs
      .readFileSync(`${swaggerUiAssetPath}/index.html`)
      .toString()
      .replace(urlRegex, 'url: "../documentation-config",')
    res.send(indexContent)
  }

  app.get('/documentation', (req, res) => {
    let targetUrl = req.originalUrl
    if (!targetUrl.endsWith('/')) {
      targetUrl += '/'
    }
    targetUrl += 'index.html'
    res.redirect(targetUrl)
  })
  app.get('/documentation/index.html', patchIndex)

  app.use('/documentation', swaggerFiles)
}
