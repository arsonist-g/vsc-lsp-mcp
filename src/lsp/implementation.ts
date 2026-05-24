import * as vscode from 'vscode'
import type { LspExecutionScope } from '../mcp/executor'
import { logger } from '../utils/logger'
import { getDocument } from './tools'

/**
 * Get the implementation locations of a symbol.
 *
 * @param uri - The document URI
 * @param line - Line number (0-based)
 * @param character - Character offset (0-based)
 * @returns Raw VSCode Location / Location[] / LocationLink[]
 */
export async function getImplementations(
  uri: string,
  line: number,
  character: number,
  scope?: LspExecutionScope,
): Promise<vscode.Location | vscode.Location[] | vscode.LocationLink[]> {
  try {
    const document = await getDocument(uri, scope)
    if (!document) {
      throw new Error(`Failed to find document: ${uri}`)
    }

    const position = new vscode.Position(line, character)

    logger.info(`Getting implementations: ${uri} line:${line} col:${character}`)

    return await vscode.commands.executeCommand<
      vscode.Location | vscode.Location[] | vscode.LocationLink[]
    >(
      'vscode.executeImplementationProvider',
      document.uri,
      position,
    )
  }
  catch (error) {
    logger.error('Failed to get implementations', error)
    throw error
  }
}
