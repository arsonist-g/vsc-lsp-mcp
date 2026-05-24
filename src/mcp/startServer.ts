import type { Server } from 'node:http'
import type express from 'express'
import { window } from 'vscode'
import { logger } from '../utils/logger'

export interface StartedHttpServer {
  server: Server
  port: number
  close: () => Promise<void>
}

export interface StartServerOptions {
  host?: string
  allowPortFallback?: boolean
  maxRetries?: number
  showStartedMessage?: boolean
  serviceName?: string
}

function toOptions(options: number | StartServerOptions = {}): StartServerOptions {
  if (typeof options === 'number') {
    return {
      allowPortFallback: options > 0,
      maxRetries: options,
      showStartedMessage: true,
      serviceName: 'LSP MCP',
    }
  }

  return options
}

export async function startServer(
  app: express.Express,
  initialPort: number,
  rawOptions: number | StartServerOptions = {},
): Promise<StartedHttpServer | undefined> {
  const options = toOptions(rawOptions)
  const host = options.host ?? '127.0.0.1'
  const allowPortFallback = options.allowPortFallback ?? false
  const maxRetries = options.maxRetries ?? 0
  const serviceName = options.serviceName ?? 'LSP MCP'
  let currentPort = initialPort
  let retries = 0
  let hasShownPortConflict = false

  const tryListen = (): Promise<StartedHttpServer | undefined> => {
    return new Promise((resolve, reject) => {
      logger.info(`Starting ${serviceName} server on ${host}:${currentPort}`)

      const server = app.listen(currentPort, host, () => {
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : currentPort

        logger.info(`${serviceName} server started on ${host}:${port}`)

        if (options.showStartedMessage) {
          if (hasShownPortConflict) {
            window.showWarningMessage(`${serviceName} 启动在 ${port}（原端口 ${initialPort} 被占用，请确认客户端连接实际端口）`)
          }
          else {
            window.showInformationMessage(`${serviceName} 启动在 ${port}`)
          }
        }

        resolve({
          server,
          port,
          close: () => new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error)
                return
              }
              closeResolve()
            })
          }),
        })
      })

      server.once('error', async (err: NodeJS.ErrnoException) => {
        server.removeAllListeners()

        if (err.code === 'EADDRINUSE' && allowPortFallback && retries < maxRetries) {
          logger.warn(`${serviceName} port ${currentPort} is occupied, trying ${currentPort + 1}`, {
            code: err.code,
            message: err.message,
          })
          retries++
          currentPort++
          hasShownPortConflict = true
          resolve(await tryListen())
          return
        }

        if (err.code === 'EADDRINUSE') {
          logger.warn(`${serviceName} port ${currentPort} is occupied`, {
            code: err.code,
            message: err.message,
          })
          resolve(undefined)
          return
        }

        logger.error(`Unable to start ${serviceName} server on ${host}:${currentPort}`, err)
        reject(err)
      })
    })
  }

  return tryListen()
}
