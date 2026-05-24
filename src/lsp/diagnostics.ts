import * as vscode from 'vscode'
import type { LspExecutionScope } from '../mcp/executor'
import { logger } from '../utils/logger'
import { isPathInWorkspace } from '../workspace/info'
import { getDocument } from './tools'

export interface ProblemDiagnostics {
  uri: vscode.Uri
  diagnostics: vscode.Diagnostic[]
}

function isWorkspaceResource(resource: vscode.Uri, scope?: LspExecutionScope): boolean {
  if (!vscode.workspace.getWorkspaceFolder(resource))
    return false

  if (!scope || scope.allowFilesOutsideWorkspace)
    return true

  return resource.scheme !== 'file' || isPathInWorkspace(resource.fsPath, scope.workspaceFolders.map(folder => ({
    name: folder,
    uri: vscode.Uri.file(folder).toString(),
    fsPath: folder,
    normalizedPath: folder,
  })))
}

export async function getProblems(uri?: string, scope?: LspExecutionScope): Promise<ProblemDiagnostics[]> {
  try {
    if (uri) {
      const document = await getDocument(uri, scope)
      if (!document) {
        throw new Error(`Failed to find document: ${uri}`)
      }

      logger.info(`Getting problems: ${uri}`)
      return [{ uri: document.uri, diagnostics: vscode.languages.getDiagnostics(document.uri) }]
    }

    logger.info('Getting all workspace problems')
    return vscode.languages.getDiagnostics()
      .filter(([resource]) => isWorkspaceResource(resource, scope))
      .map(([resource, diagnostics]) => ({
        uri: resource,
        diagnostics,
      }))
  }
  catch (error) {
    logger.error('Failed to get problems', error)
    throw error
  }
}
