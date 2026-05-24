import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import express from 'express'
import { window } from 'vscode'
import { addLspTools } from './tools'
import { callInstanceExecuteLsp } from './rpc'
import { selectInstance } from './routing'
import type { ExecuteLspArgs } from './executor'
import type { LspMcpInstance, RoutingOptions } from './routing'
import type { StartedHttpServer } from './startServer'
import { cors } from './cors'
import { handleSessionRequest } from './session'
import { startServer } from './startServer'
import { logger } from '../utils/logger'
import { transports } from './config'

export interface BrokerRuntime {
  server: StartedHttpServer
  registerLocalInstance: (instance: LspMcpInstance) => void
  dispose: () => Promise<void>
}

export interface BrokerOptions {
  port: number
  corsEnabled: boolean
  allowOrigins: string[] | '*'
  withCredentials: boolean
  exposeHeaders: string[]
  routing: RoutingOptions
  staleTimeoutMs: number
}

function getErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: 'code' in error ? error.code : undefined,
    }
  }

  return { message: String(error) }
}

export async function startBroker(options: BrokerOptions): Promise<BrokerRuntime | undefined> {
  const app = express()
  const instances = new Map<string, LspMcpInstance>()

  if (options.corsEnabled)
    app.use(cors(options.allowOrigins, options.withCredentials, options.exposeHeaders))

  app.use(express.json({ limit: '2mb' }))

  const upsertInstance = (instance: LspMcpInstance) => {
    instances.set(instance.windowId, { ...instance, lastSeen: Date.now() })
    logger.info(`Registered LSP MCP instance: ${instance.windowId}`, {
      rpcUrl: instance.rpcUrl,
      workspaceFolders: instance.workspaceFolders.map(folder => folder.fsPath),
    })
  }

  app.post('/instances/register', (req, res) => {
    upsertInstance(req.body as LspMcpInstance)
    res.json({ ok: true })
  })

  app.post('/instances/unregister', (req, res) => {
    const { windowId } = req.body as { windowId?: string }
    if (windowId)
      instances.delete(windowId)
    res.json({ ok: true })
  })

  app.post('/instances/heartbeat', (req, res) => {
    const { windowId } = req.body as { windowId?: string }
    const instance = windowId ? instances.get(windowId) : undefined
    if (!instance) {
      res.status(404).json({ ok: false, error: 'Instance not registered' })
      return
    }

    instances.set(instance.windowId, { ...instance, lastSeen: Date.now() })
    res.json({ ok: true })
  })

  app.get('/instances', (_req, res) => {
    res.json({ instances: Array.from(instances.values()) })
  })

  app.post('/mcp', async (req, res) => {
    let phase = 'routing request'
    let sessionId = req.headers['mcp-session-id'] as string | undefined

    try {
      let transport: StreamableHTTPServerTransport

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId]
      }
      else if (!sessionId && isInitializeRequest(req.body)) {
        phase = 'initializing MCP transport'
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            sessionId = newSessionId
            transports[newSessionId] = transport
            logger.info(`MCP session initialized: ${newSessionId}`)
          },
          allowedHosts: ['127.0.0.1', 'localhost'],
        })

        transport.onclose = () => {
          if (transport.sessionId) {
            logger.info(`MCP session closed: ${transport.sessionId}`)
            delete transports[transport.sessionId]
          }
        }

        const server = new McpServer({
          name: 'lsp-server',
          version: '0.0.2',
        })

        addLspTools(server, async (args: ExecuteLspArgs) => {
          const instance = selectInstance(args, Array.from(instances.values()), options.routing)
          return callInstanceExecuteLsp(instance, args)
        })

        phase = 'connecting MCP server to transport'
        await server.connect(transport)
      }
      else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
            data: {
              sessionIdProvided: Boolean(sessionId),
              knownSessionIds: Object.keys(transports),
              initializeRequest: isInitializeRequest(req.body),
            },
          },
          id: null,
        })
        return
      }

      phase = 'handling MCP request'
      await transport.handleRequest(req, res, req.body)
    }
    catch (error) {
      logger.error(`MCP POST /mcp failed while ${phase}`, error)

      if (res.headersSent)
        return

      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: `MCP request failed while ${phase}`,
          data: {
            sessionId,
            ...getErrorDetails(error),
          },
        },
        id: req.body?.id ?? null,
      })
    }
  })

  app.get('/mcp', handleSessionRequest)

  const publicServer = await startServer(app, options.port, {
    host: '127.0.0.1',
    serviceName: 'LSP MCP broker',
    showStartedMessage: true,
  })

  if (!publicServer)
    return undefined

  window.showInformationMessage(`LSP MCP broker 启动在 ${publicServer.port}`)

  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [windowId, instance] of instances) {
      if (!instance.isBroker && now - instance.lastSeen > options.staleTimeoutMs) {
        logger.warn(`Removing stale LSP MCP instance: ${windowId}`)
        instances.delete(windowId)
      }
    }
  }, options.staleTimeoutMs)

  return {
    server: publicServer,
    registerLocalInstance: upsertInstance,
    dispose: async () => {
      clearInterval(cleanupInterval)
      await publicServer.close()
    },
  }
}
