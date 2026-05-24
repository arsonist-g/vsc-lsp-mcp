import * as vscode from 'vscode'
import type { LspExecutionScope } from '../mcp/executor'
import { logger } from '../utils/logger'
import { fsPathFromUriLike, isPathInWorkspace } from '../workspace/info'

/**
 * Resolve a file path string or URI string into a VSCode Uri.
 * If the input has a URI scheme (e.g. file://, jdt://), it is parsed as a URI.
 * Otherwise it is treated as a local file path and converted via Uri.file().
 *
 * @param input - File path or URI string
 * @returns VSCode Uri
 */
export function resolveUri(input: string): vscode.Uri {
  if (/^(file|jdt):\/\//.test(input)) {
    return vscode.Uri.parse(input)
  }
  return vscode.Uri.file(input)
}

function assertDocumentAllowed(uri: string, scope?: LspExecutionScope): void {
  if (!scope || scope.allowFilesOutsideWorkspace)
    return

  const fsPath = fsPathFromUriLike(uri)
  if (!fsPath)
    return

  if (!isPathInWorkspace(fsPath, scope.workspaceFolders.map(folder => ({
    name: folder,
    uri: vscode.Uri.file(folder).toString(),
    fsPath: folder,
    normalizedPath: folder,
  })))) {
    throw new Error(`File is outside the routed VS Code workspace: ${uri}`)
  }
}

/**
 * Get document by URI or file path
 *
 * @param uri - Document URI or file path
 * @returns TextDocument or undefined
 */
export async function getDocument(uri: string, scope?: LspExecutionScope): Promise<vscode.TextDocument | undefined> {
  try {
    assertDocumentAllowed(uri, scope)
    const docUri = resolveUri(uri)

    for (const doc of vscode.workspace.textDocuments) {
      if (doc.uri.toString() === docUri.toString())
        return doc
    }

    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() === docUri.toString()) {
        return editor.document
      }
    }

    return await vscode.workspace.openTextDocument(docUri)
  }
  catch (error) {
    logger.error(`Failed to open document: ${uri}`, error)
    return undefined
  }
}
