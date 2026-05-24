import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { executeLspOperation, ops } from './executor'
import type { ExecuteLspArgs } from './executor'

const uriDesc = `URI or absolute file path.
- Plain path (no scheme): treated as absolute file path on disk, e.g. "/home/user/file.ts" or "C:/path/to/file.ts". Recommended for all file operations.
- URI with scheme (e.g. file://, jdt://): parsed directly. Scheme part is case-insensitive, path requires proper percent-encoding. Do NOT construct file:// URIs manually.
- Required for file-specific operations. Optional for "problems"; omit it to return all workspace Problems for the routed project.
- For "class_file_contents": must be a jdt:// URI (scheme "jdt:").`

const projectPathDesc = `Absolute path to the intended project or workspace root.
- Recommended when multiple VS Code windows are open.
- Required for workspace-wide operations when the target window cannot be inferred from uri/cwd.
- Required for jdt:// class_file_contents and rename when multiple projects are registered.`

const toolDesc = `Execute an LSP operation.

IMPORTANT — All positions are 1-based:
- Input: line & character use 1-based indexing (matching editor display). VS Code shows "Ln 9, Col 16" → pass line=9, character=16.
- Output: all line/character values in results are also 1-based. You can directly use output positions (e.g. namePosition "9:16") as input for the next call (line=9, character=16) — no conversion needed.

Operations requiring line & character:
- hover: Get hover documentation (signature, JSDoc) at position. Returns: formatted documentation text.
- definition: Jump to symbol definition. Returns: file path + line range.
- declaration: Jump to symbol declaration (e.g. TypeScript .d.ts). Returns: file path + line range.
- implementation: Jump to implementation (for interfaces/abstract classes). Returns: file path + line range.
- references: Find all references of symbol. Returns: list of file paths + line ranges.
- completions: Code completions at position. Returns: up to 50 completion items with kind and detail.
- rename: Rename symbol across workspace. Requires newName. Returns: summary of files and edits changed.
- symbol_at_position: Get symbol metadata (name, kind, range, namePosition). Returns: call hierarchy item.
- incoming_calls: Find all callers of the function at position. Returns: caller list with namePosition for chaining.
- outgoing_calls: Find all callees of the function at position. Returns: callee list with namePosition for chaining.

Operations that do NOT need line/character:
- document_symbols: Get symbol outline of the file (only needs uri). Returns: hierarchical symbol tree.
- workspace_symbols: Search symbols across workspace by query (empty query returns all symbols, truncated by maxResults setting). Returns: matching symbols grouped by file.
- class_file_contents: Get decompiled Java class source via jdt:// URI (only needs uri). Returns: Java source code.
- problems: Get VS Code Problems diagnostics. Optional uri filters to one file; omit uri to return all workspace Problems for the routed project.`

export type ExecuteLspHandler = (args: ExecuteLspArgs) => Promise<string>

export function addLspTools(server: McpServer, execute: ExecuteLspHandler = executeLspOperation) {
  server.registerTool(
    'execute_lsp',
    {
      title: 'Execute LSP Operation',
      description: toolDesc,
      inputSchema: {
        operation: z.enum(ops).describe('Which LSP operation to execute.'),
        uri: z.string().optional().describe(uriDesc),
        line: z.number().int().min(1).optional().describe('Line number (1-based, as shown in editor). Required for position-dependent operations.'),
        character: z.number().int().min(1).optional().describe('Character offset (1-based, as shown in editor). Required for position-dependent operations.'),
        newName: z.string().optional().describe('New symbol name. Required only for "rename".'),
        query: z.string().optional().describe('Search query. Required only for "workspace_symbols".'),
        projectPath: z.string().optional().describe(projectPathDesc),
        cwd: z.string().optional().describe('Current working directory of the caller. Used to route requests to the matching VS Code window when projectPath is omitted.'),
        windowId: z.string().optional().describe('Explicit VS Code window instance ID. Use only when disambiguating multiple matching windows.'),
      },
    },
    async (args) => {
      const result = await execute(args as ExecuteLspArgs)
      return { content: [{ type: 'text', text: result }] }
    },
  )
}
