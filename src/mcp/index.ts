import { randomUUID } from 'node:crypto'
import { window, workspace } from 'vscode'
import type * as vscode from 'vscode'
import { startBroker } from './broker'
import { transports } from './config'
import { startInstanceRpc } from './rpc'
import type { LspMcpInstance } from './routing'
import { getWorkspaceFoldersInfo } from '../workspace/info'
import { logger } from '../utils/logger'

function getNumberConfig(config: vscode.WorkspaceConfiguration, key: string, fallback: number): number {
  const value = config.get<number>(key, fallback)
  return typeof value === 'number' ? value : fallback
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function registerWithBroker(brokerUrl: string, instance: LspMcpInstance): Promise<boolean> {
  try {
    const response = await postJson(`${brokerUrl}/instances/register`, instance)
    return response.ok
  }
  catch (error) {
    logger.warn('Failed to register LSP MCP instance with broker', {
      brokerUrl,
      message: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

async function unregisterFromBroker(brokerUrl: string, windowId: string): Promise<void> {
  try {
    await postJson(`${brokerUrl}/instances/unregister`, { windowId })
  }
  catch (error) {
    logger.warn('Failed to unregister LSP MCP instance from broker', {
      brokerUrl,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function startMcp(_context?: vscode.ExtensionContext): Promise<vscode.Disposable | undefined> {
  const config = workspace.getConfiguration('lsp-mcp')
  const isMcpEnabled = config.get('enabled', true)
  const mcpPort = getNumberConfig(config, 'port', 9527)

  const corsEnabled = config.get('cors.enabled', true)
  const allowOriginsStr: string = config.get('cors.allowOrigins', '*')
  const withCredentials = config.get('cors.withCredentials', false)
  const exposeHeadersStr: string = config.get('cors.exposeHeaders', 'Mcp-Session-Id')

  const heartbeatIntervalMs = getNumberConfig(config, 'broker.heartbeatIntervalMs', 5000)
  const staleTimeoutMs = getNumberConfig(config, 'broker.staleTimeoutMs', 15000)
  const allowSingleInstanceFallback = config.get('routing.allowSingleInstanceFallback', true)
  const requireProjectPathForAmbiguousRequests = config.get('routing.requireProjectPathForAmbiguousRequests', true)
  const allowFilesOutsideWorkspace = config.get('security.allowFilesOutsideWorkspace', false)

  if (!isMcpEnabled) {
    logger.warn('LSP MCP server is disabled by configuration.')
    window.showInformationMessage('LSP MCP server is disabled by configuration.')
    return
  }

  const workspaceFolders = getWorkspaceFoldersInfo()
  const windowId = randomUUID()
  const instanceRpc = await startInstanceRpc({
    windowId,
    workspaceFolders,
    allowFilesOutsideWorkspace,
  })

  let isDisposed = false
  let heartbeat: NodeJS.Timeout | undefined
  const brokerUrl = `http://127.0.0.1:${mcpPort}`
  const instance: LspMcpInstance = {
    windowId,
    rpcUrl: instanceRpc.rpcUrl,
    secret: instanceRpc.secret,
    workspaceFolders,
    isBroker: false,
    startedAt: Date.now(),
    lastSeen: Date.now(),
  }

  const allowOrigins = allowOriginsStr === '*'
    ? '*'
    : allowOriginsStr.split(',').map(origin => origin.trim())
  const exposeHeaders = exposeHeadersStr.split(',').map(header => header.trim())

  const broker = await startBroker({
    port: mcpPort,
    corsEnabled,
    allowOrigins,
    withCredentials,
    exposeHeaders,
    routing: {
      allowSingleInstanceFallback,
      requireProjectPathForAmbiguousRequests,
    },
    staleTimeoutMs,
  })

  if (broker) {
    instance.isBroker = true
    broker.registerLocalInstance(instance)
    logger.info('This VS Code window is the LSP MCP broker', { windowId, port: mcpPort })
  }
  else {
    const registered = await registerWithBroker(brokerUrl, instance)
    if (registered) {
      logger.info('Registered this VS Code window with LSP MCP broker', { windowId, brokerUrl })
      heartbeat = setInterval(async () => {
        if (isDisposed)
          return

        const response = await postJson(`${brokerUrl}/instances/heartbeat`, { windowId }).catch(() => undefined)
        if (!response?.ok) {
          logger.warn('LSP MCP broker heartbeat failed, trying to re-register', { windowId, brokerUrl })
          await registerWithBroker(brokerUrl, instance)
        }
      }, heartbeatIntervalMs)
    }
    else {
      window.showWarningMessage(`LSP MCP broker 端口 ${mcpPort} 已被占用，但未能注册到 broker。当前窗口无法通过稳定 MCP 入口访问。`)
    }
  }

  return {
    dispose: () => {
      isDisposed = true

      if (heartbeat)
        clearInterval(heartbeat)

      const cleanup = async () => {
        if (!broker)
          await unregisterFromBroker(brokerUrl, windowId)

        for (const sessionId of Object.keys(transports)) {
          await transports[sessionId].close().catch(error => logger.warn('Failed to close MCP transport', {
            sessionId,
            message: error instanceof Error ? error.message : String(error),
          }))
          delete transports[sessionId]
        }

        if (broker)
          await broker.dispose()

        await instanceRpc.server.close()
      }

      cleanup().catch(error => logger.error('Failed to dispose LSP MCP runtime', error))
    },
  }
}
