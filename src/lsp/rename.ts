import * as vscode from 'vscode'
import type { LspExecutionScope } from '../mcp/executor'
import { logger } from '../utils/logger'
import { isPathInWorkspace } from '../workspace/info'
import { getDocument } from './tools'

function assertWorkspaceEditAllowed(edit: vscode.WorkspaceEdit, scope?: LspExecutionScope): void {
  if (!scope || scope.allowFilesOutsideWorkspace)
    return

  const rejected = edit.entries()
    .map(([uri]) => uri)
    .filter(uri => uri.scheme === 'file' && !isPathInWorkspace(uri.fsPath, scope.workspaceFolders.map(folder => ({
      name: folder,
      uri: vscode.Uri.file(folder).toString(),
      fsPath: folder,
      normalizedPath: folder,
    }))))
    .map(uri => uri.fsPath)

  if (rejected.length > 0) {
    throw new Error(`Rename would edit files outside the routed workspace: ${rejected.slice(0, 5).join(', ')}`)
  }
}

/**
 * Rename a symbol across the workspace.
 * Does NOT list every individual edit to avoid overflowing context window.
 *
 * @param uri - The document URI
 * @param line - Line number (0-based)
 * @param character - Character offset (0-based)
 * @param newName - The new name for the symbol
 * @returns Raw VSCode WorkspaceEdit
 */
export async function rename(
  uri: string,
  line: number,
  character: number,
  newName: string,
  scope?: LspExecutionScope,
): Promise<vscode.WorkspaceEdit> {
  try {
    const document = await getDocument(uri, scope)
    if (!document) {
      throw new Error(`Failed to find document: ${uri}`)
    }

    const position = new vscode.Position(line, character)

    logger.info(`Renaming: ${uri} line:${line} col:${character} newName:${newName}`)

    const canRename = await vscode.commands.executeCommand<vscode.Range | {
      range: vscode.Range
      placeholder: string
    }>(
      'vscode.prepareRename',
      document.uri,
      position,
    )

    if (!canRename) {
      throw new Error('Rename is not supported at this position')
    }

    const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
      'vscode.executeDocumentRenameProvider',
      document.uri,
      position,
      newName,
    )

    if (!edit) {
      throw new Error('Rename returned no changes')
    }

    assertWorkspaceEditAllowed(edit, scope)
    await vscode.workspace.applyEdit(edit)

    return edit
  }
  catch (error) {
    logger.error('Failed to rename symbol', error)
    throw error
  }
}
