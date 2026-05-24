import { defineExtension } from 'reactive-vscode'
import { startMcp } from './mcp'
import { logger } from './utils/logger'

const { activate, deactivate } = defineExtension(async (context) => {
  const runtime = await startMcp(context)
  if (runtime)
    context.subscriptions.push(runtime)

  context.subscriptions.push({ dispose: () => logger.dispose() })
})

export { activate, deactivate }
