import * as vscode from 'vscode'
import { logger } from '../utils/logger'
import { getDocument } from './tools'

export interface ProblemDiagnostics {
  uri: vscode.Uri
  diagnostics: vscode.Diagnostic[]
}

function isWorkspaceResource(resource: vscode.Uri): boolean {
  return vscode.workspace.getWorkspaceFolder(resource) !== undefined
}

export async function getProblems(uri?: string): Promise<ProblemDiagnostics[]> {
  try {
    if (uri) {
      const document = await getDocument(uri)
      if (!document) {
        throw new Error(`Failed to find document: ${uri}`)
      }

      logger.info(`Getting problems: ${uri}`)
      return [{ uri: document.uri, diagnostics: vscode.languages.getDiagnostics(document.uri) }]
    }

    logger.info('Getting all workspace problems')
    return vscode.languages.getDiagnostics()
      .filter(([resource]) => isWorkspaceResource(resource))
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
