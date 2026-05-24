import * as vscode from 'vscode'
import type { LspExecutionScope } from '../mcp/executor'
import { logger } from '../utils/logger'
import { isPathInWorkspace } from '../workspace/info'

/**
 * Search for symbols across the entire workspace.
 *
 * @param query - Search query string
 * @returns Raw VSCode SymbolInformation array
 */
export async function getWorkspaceSymbols(
  query: string,
  scope?: LspExecutionScope,
): Promise<vscode.SymbolInformation[]> {
  try {
    logger.info(`Searching workspace symbols: ${query}`)

    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      query,
    )

    if (!scope || scope.allowFilesOutsideWorkspace)
      return symbols || []

    return (symbols || []).filter((symbol) => {
      if (symbol.location.uri.scheme !== 'file')
        return true
      return isPathInWorkspace(symbol.location.uri.fsPath, scope.workspaceFolders.map(folder => ({
        name: folder,
        uri: vscode.Uri.file(folder).toString(),
        fsPath: folder,
        normalizedPath: folder,
      })))
    })
  }
  catch (error) {
    logger.error('Failed to get workspace symbols', error)
    throw error
  }
}
