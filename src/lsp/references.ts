import * as vscode from 'vscode'
import type { LspExecutionScope } from '../mcp/executor'
import { logger } from '../utils/logger'
import { getDocument } from './tools'

/**
 * Find all references to a symbol.
 *
 * @param uri - The document URI
 * @param line - Line number (0-based)
 * @param character - Character offset (0-based)
 * @returns Raw VSCode Location array
 */
export async function getReferences(
  uri: string,
  line: number,
  character: number,
  scope?: LspExecutionScope,
): Promise<vscode.Location[]> {
  try {
    const document = await getDocument(uri, scope)
    if (!document) {
      throw new Error(`Failed to find document: ${uri}`)
    }

    const position = new vscode.Position(line, character)

    logger.info(`Getting references: ${uri} line:${line} col:${character}`)

    const references = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      document.uri,
      position,
    )

    return references || []
  }
  catch (error) {
    logger.error('Failed to get references', error)
    throw error
  }
}
