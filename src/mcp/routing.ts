import type { ExecuteLspArgs } from './executor'
import type { WorkspaceFolderInfo } from '../workspace/info'
import { findBestWorkspaceMatch, fsPathFromUriLike, normalizeFsPath } from '../workspace/info'

export interface LspMcpInstance {
  windowId: string
  rpcUrl: string
  secret: string
  workspaceFolders: WorkspaceFolderInfo[]
  isBroker: boolean
  startedAt: number
  lastSeen: number
}

export interface RoutingOptions {
  allowSingleInstanceFallback: boolean
  requireProjectPathForAmbiguousRequests: boolean
}

export function selectInstance(
  args: ExecuteLspArgs,
  instances: LspMcpInstance[],
  options: RoutingOptions,
): LspMcpInstance {
  const liveInstances = instances.filter(instance => instance.workspaceFolders.length > 0)

  if (args.windowId) {
    const match = instances.find(instance => instance.windowId === args.windowId)
    if (!match)
      throw new Error(formatRoutingError(`No VS Code window is registered with windowId "${args.windowId}"`, instances))
    return match
  }

  const pathCandidates = [args.projectPath, args.cwd, fsPathFromUriLike(args.uri ?? '')].filter((value): value is string => Boolean(value))

  for (const candidate of pathCandidates) {
    const match = findInstanceByPath(candidate, liveInstances)
    if (match)
      return match
  }

  if (args.operation === 'class_file_contents' && args.uri?.startsWith('jdt://')) {
    throw new Error(formatRoutingError('jdt:// requests require projectPath or windowId when routing across VS Code windows.', instances))
  }

  if (options.allowSingleInstanceFallback && instances.length === 1)
    return instances[0]

  if (options.requireProjectPathForAmbiguousRequests || instances.length > 1) {
    throw new Error(formatRoutingError('Ambiguous LSP target. Provide projectPath, cwd, uri, or windowId.', instances))
  }

  throw new Error(formatRoutingError('No VS Code window instance is available for this LSP request.', instances))
}

function findInstanceByPath(value: string, instances: LspMcpInstance[]): LspMcpInstance | undefined {
  const normalized = normalizeFsPath(value)

  return instances
    .map((instance) => {
      const folder = findBestWorkspaceMatch(normalized, instance.workspaceFolders)
      return folder ? { instance, score: folder.normalizedPath.length } : undefined
    })
    .filter((entry): entry is { instance: LspMcpInstance, score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score)[0]?.instance
}

function formatRoutingError(message: string, instances: LspMcpInstance[]): string {
  const candidates = instances.length === 0
    ? 'No registered VS Code window instances.'
    : instances.map(instance => [
        `- windowId: ${instance.windowId}${instance.isBroker ? ' (broker)' : ''}`,
        ...instance.workspaceFolders.map(folder => `  - ${folder.fsPath}`),
      ].join('\n')).join('\n')

  return `${message}\n\nCandidates:\n${candidates}`
}
