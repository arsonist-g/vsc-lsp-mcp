import type express from 'express'
import { logger } from '../utils/logger'
import { transports } from './config'

/**
 * 处理连接
 */
export async function handleSessionRequest(req: express.Request, res: express.Response) {
  const sessionId = req.headers['mcp-session-id'] as string | undefined

  try {
    if (!sessionId || !transports[sessionId]) {
      logger.warn('Invalid MCP session request', {
        sessionIdProvided: Boolean(sessionId),
        knownSessionIds: Object.keys(transports),
      })
      res.status(400).json({
        error: 'Invalid or missing session ID',
        sessionIdProvided: Boolean(sessionId),
        knownSessionIds: Object.keys(transports),
      })
      return
    }

    const transport = transports[sessionId]
    await transport.handleRequest(req, res)
  }
  catch (error) {
    logger.error('MCP GET /mcp failed while handling session request', error)

    if (res.headersSent)
      return

    res.status(500).json({
      error: 'MCP session request failed',
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
