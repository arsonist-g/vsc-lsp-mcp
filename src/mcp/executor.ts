import {
  getClassFileContents,
  getCompletions,
  getDeclarations,
  getDefinition,
  getDocumentSymbols,
  getHover,
  getImplementations,
  getIncomingCalls,
  getOutgoingCalls,
  getProblems,
  getReferences,
  getWorkspaceSymbols,
  prepareCallHierarchy,
  rename,
} from '../lsp'
import { transform } from '../transform'

export const ops = [
  'completions',
  'definition',
  'declaration',
  'implementation',
  'hover',
  'references',
  'document_symbols',
  'workspace_symbols',
  'class_file_contents',
  'rename',
  'symbol_at_position',
  'incoming_calls',
  'outgoing_calls',
  'problems',
] as const

export type LspOperation = typeof ops[number]

export interface ExecuteLspArgs {
  operation: LspOperation
  uri?: string
  line?: number
  character?: number
  newName?: string
  query?: string
  projectPath?: string
  cwd?: string
  windowId?: string
}

export interface LspExecutionScope {
  windowId: string
  projectPath?: string
  workspaceFolders: string[]
  allowFilesOutsideWorkspace: boolean
}

const positionOps = new Set<LspOperation>([
  'completions',
  'definition',
  'declaration',
  'implementation',
  'hover',
  'references',
  'rename',
  'symbol_at_position',
  'incoming_calls',
  'outgoing_calls',
])

export async function executeLspOperation(args: ExecuteLspArgs, scope?: LspExecutionScope): Promise<string> {
  const { operation, uri, line: rawLine, character: rawChar, newName, query } = args
  let line = 0
  let character = 0

  const requireUri = () => {
    if (!uri)
      throw new Error(`"${operation}" requires the "uri" parameter`)
    return uri
  }

  if (positionOps.has(operation)) {
    if (rawLine == null || rawChar == null) {
      throw new Error(`"${operation}" requires "line" and "character" parameters (1-based)`)
    }
    line = rawLine - 1
    character = rawChar - 1
  }

  switch (operation) {
    case 'completions':
      return transform.formatCompletions(await getCompletions(requireUri(), line, character, scope))
    case 'definition':
      return transform.formatLocationsOrLinks(await getDefinition(requireUri(), line, character, scope), 'Definition')
    case 'declaration':
      return transform.formatLocationsOrLinks(await getDeclarations(requireUri(), line, character, scope), 'Declaration')
    case 'implementation':
      return transform.formatLocationsOrLinks(await getImplementations(requireUri(), line, character, scope), 'Implementation')
    case 'hover':
      return transform.formatHover(await getHover(requireUri(), line, character, scope))
    case 'references':
      return transform.formatLocations(await getReferences(requireUri(), line, character, scope), 'References')
    case 'document_symbols':
      return transform.formatDocumentSymbols(await getDocumentSymbols(requireUri(), scope))
    case 'workspace_symbols':
      return await transform.formatWorkspaceSymbols(await getWorkspaceSymbols(query ?? '', scope))
    case 'class_file_contents':
      return transform.formatClassFile(await getClassFileContents(requireUri(), scope))
    case 'rename': {
      if (!newName)
        throw new Error('"rename" requires the "newName" parameter')
      const edit = await rename(requireUri(), line, character, newName, scope)
      return transform.formatRename(edit, newName)
    }
    case 'symbol_at_position': {
      const rawItems = await prepareCallHierarchy(requireUri(), line, character, scope)
      const items = !rawItems ? [] : (Array.isArray(rawItems) ? rawItems : [rawItems])
      return transform.formatCallHierarchyItems(items)
    }
    case 'incoming_calls':
      return transform.formatIncomingCalls(await getIncomingCalls(requireUri(), line, character, scope))
    case 'outgoing_calls':
      return transform.formatOutgoingCalls(await getOutgoingCalls(requireUri(), line, character, scope))
    case 'problems':
      return transform.formatDiagnostics(await getProblems(uri, scope))
  }
}
