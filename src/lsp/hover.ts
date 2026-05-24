import * as vscode from 'vscode'
import type { LspExecutionScope } from '../mcp/executor'
import { logger } from '../utils/logger'
import { getDocument } from './tools'

/**
 * Get hover information at a given position.
 *
 * @param uri - The document URI
 * @param line - Line number (0-based)
 * @param character - Character offset (0-based)
 * @returns Raw VSCode Hover array
 */
export async function getHover(
  uri: string,
  line: number,
  character: number,
  scope?: LspExecutionScope,
): Promise<vscode.Hover[]> {
  try {
    const document = await getDocument(uri, scope)
    if (!document) {
      throw new Error(`Failed to find document: ${uri}`)
    }

    const position = new vscode.Position(line, character)

    logger.info(`Getting hover info: ${uri} line:${line} col:${character}`)

    const hoverResults = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      document.uri,
      position,
    )

    return hoverResults || []
  }
  catch (error) {
    logger.error('Failed to get hover information', error)
    throw error
  }
}
