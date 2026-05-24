import { randomUUID } from 'node:crypto'
import express from 'express'
import { workspace } from 'vscode'
import { executeLspOperation } from './executor'
import type { ExecuteLspArgs, LspExecutionScope } from './executor'
import type { StartedHttpServer } from './startServer'
import type { WorkspaceFolderInfo } from '../workspace/info'
import { startServer } from './startServer'
import { logger } from '../utils/logger'

export interface InstanceRuntime {
  windowId: string
  secret: string
  rpcUrl: string
  server: StartedHttpServer
}

export interface StartInstanceRpcOptions {
  windowId: string
  workspaceFolders: WorkspaceFolderInfo[]
  allowFilesOutsideWorkspace: boolean
}

export async function startInstanceRpc(options: StartInstanceRpcOptions): Promise<InstanceRuntime> {
  const app = express()
  const secret = randomUUID()

  app.use(express.json({ limit: '2mb' }))

  app.get('/rpc/health', (_req, res) => {
    res.json({ ok: true, windowId: options.windowId, workspaceFolders: options.workspaceFolders })
  })

  app.post('/rpc/execute_lsp', async (req, res) => {
    const authorization = req.headers.authorization
    if (authorization !== `Bearer ${secret}`) {
      res.status(401).json({ ok: false, error: 'Unauthorized' })
      return
    }

    try {
      const args = req.body as ExecuteLspArgs
      const scope: LspExecutionScope = {
        windowId: options.windowId,
        projectPath: args.projectPath,
        workspaceFolders: options.workspaceFolders.map(folder => folder.fsPath),
        allowFilesOutsideWorkspace: options.allowFilesOutsideWorkspace,
      }
      const result = await executeLspOperation(args, scope)
      res.json({ ok: true, result })
    }
    catch (error) {
      logger.error('Instance RPC execute_lsp failed', error)
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  const server = await startServer(app, 0, {
    host: '127.0.0.1',
    serviceName: 'LSP MCP instance RPC',
    showStartedMessage: false,
  })

  if (!server)
    throw new Error('Failed to start LSP MCP instance RPC server')

  const rpcUrl = `http://127.0.0.1:${server.port}`
  logger.info(`LSP MCP instance RPC started: ${rpcUrl}`, {
    windowId: options.windowId,
    workspaceName: workspace.name,
  })

  return {
    windowId: options.windowId,
    secret,
    rpcUrl,
    server,
  }
}

export async function callInstanceExecuteLsp(instance: { rpcUrl: string, secret: string }, args: ExecuteLspArgs): Promise<string> {
  const response = await fetch(`${instance.rpcUrl}/rpc/execute_lsp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${instance.secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })

  const payload = await response.json() as { ok: boolean, result?: string, error?: string }

  if (!response.ok || !payload.ok)
    throw new Error(payload.error ?? `Instance RPC failed with status ${response.status}`)

  return payload.result ?? ''
}
