import type express from 'express'
import { window } from 'vscode'
import { logger } from '../utils/logger'

/**
 * 尝试启动服务器，如果端口被占用则尝试其他端口
 * @param app - 应用实例
 * @param initialPort - 初始端口
 * @param maxRetries - 最大重试次数
 */
export function startServer(app: express.Express, initialPort: number, maxRetries: number) {
  let currentPort = initialPort
  let retries = 0
  let hasShownPortConflict = false

  const tryListen = () => {
    logger.info(`Starting LSP MCP server on port ${currentPort}`)
    const server = app.listen(currentPort, (error: Error | undefined) => {
      // 不打印多个窗口同时启动的冲突
      if (error) {
        logger.error(`Failed to start LSP MCP server on port ${currentPort}`, error)
        return
      }

      logger.info(`LSP MCP server started on port ${currentPort}`)

      // 如果之前显示过端口冲突提示，则显示最终成功启动的消息
      if (hasShownPortConflict) {
        window.showInformationMessage(`LSP MCP 启动在 ${currentPort}（原端口 ${initialPort} 被占用）`)
      }
      else {
        window.showInformationMessage(`LSP MCP 启动在 ${currentPort}`)
      }
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && retries < maxRetries) {
        logger.warn(`LSP MCP port ${currentPort} is occupied, trying ${currentPort + 1}`, {
          code: err.code,
          message: err.message,
        })
        // 端口被占用，尝试下一个端口
        retries++
        currentPort++
        hasShownPortConflict = true

        tryListen()
      }
      else {
        logger.error(`Unable to start LSP MCP server on port ${currentPort}`, err)
        window.showErrorMessage(`无法启动 LSP MCP 服务: ${err.message}`)
      }
    })
  }

  tryListen()
}
