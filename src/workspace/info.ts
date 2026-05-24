import * as path from 'node:path'
import * as vscode from 'vscode'

export interface WorkspaceFolderInfo {
  name: string
  uri: string
  fsPath: string
  normalizedPath: string
}

export function normalizeFsPath(value: string): string {
  return path.resolve(value).replace(/[/\\]+$/, '')
}

export function getWorkspaceFoldersInfo(): WorkspaceFolderInfo[] {
  return (vscode.workspace.workspaceFolders ?? []).map(folder => ({
    name: folder.name,
    uri: folder.uri.toString(),
    fsPath: folder.uri.fsPath,
    normalizedPath: normalizeFsPath(folder.uri.fsPath),
  }))
}

export function pathStartsWith(parent: string, child: string): boolean {
  const normalizedParent = normalizeFsPath(parent)
  const normalizedChild = normalizeFsPath(child)
  const relative = path.relative(normalizedParent, normalizedChild)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function findBestWorkspaceMatch(
  value: string,
  workspaceFolders: WorkspaceFolderInfo[],
): WorkspaceFolderInfo | undefined {
  const normalizedValue = normalizeFsPath(value)

  return workspaceFolders
    .filter(folder => pathStartsWith(folder.normalizedPath, normalizedValue))
    .sort((a, b) => b.normalizedPath.length - a.normalizedPath.length)[0]
}

export function isPathInWorkspace(value: string, workspaceFolders: WorkspaceFolderInfo[]): boolean {
  return Boolean(findBestWorkspaceMatch(value, workspaceFolders))
}

export function fsPathFromUriLike(value: string): string | undefined {
  if (/^jdt:\/\//.test(value))
    return undefined

  if (/^file:\/\//.test(value))
    return vscode.Uri.parse(value).fsPath

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value))
    return undefined

  return value
}
