import * as vscode from 'vscode'
import type { LspExecutionScope } from '../mcp/executor'
import { logger } from '../utils/logger'
import { getDocument } from './tools'

/**
 * Get code completion suggestions at a given position.
 *
 * @param uri - The document URI
 * @param line - Line number (0-based)
 * @param character - Character offset (0-based)
 * @returns Raw VSCode CompletionList
 */
export async function getCompletions(
  uri: string,
  line: number,
  character: number,
  scope?: LspExecutionScope,
): Promise<vscode.CompletionList> {
  try {
    const document = await getDocument(uri, scope)
    if (!document) {
      throw new Error(`Failed to find document: ${uri}`)
    }

    const position = new vscode.Position(line, character)

    logger.info(`Getting completions: ${uri} line:${line} col:${character}`)

    const result = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      document.uri,
      position,
      undefined,
      30,
    )

    return result ?? new vscode.CompletionList([])
  }
  catch (error) {
    logger.error('Failed to get completions', error)
    throw error
  }
}
