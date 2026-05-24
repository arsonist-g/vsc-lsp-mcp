import * as vscode from 'vscode'
import type { LspExecutionScope } from '../mcp/executor'
import { logger } from '../utils/logger'
import { getDocument } from './tools'

/**
 * Get the declaration location of a symbol.
 *
 * @param uri - The document URI
 * @param line - Line number (0-based)
 * @param character - Character offset (0-based)
 * @returns Raw VSCode Location / Location[] / LocationLink[]
 */
export async function getDeclarations(
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

    logger.info(`Getting declarations: ${uri} line:${line} col:${character}`)

    return await vscode.commands.executeCommand<
      vscode.Location | vscode.Location[] | vscode.LocationLink[]
    >(
      'vscode.executeDeclarationProvider',
      document.uri,
      position,
    )
  }
  catch (error) {
    logger.error('Failed to get declarations', error)
    throw error
  }
}
