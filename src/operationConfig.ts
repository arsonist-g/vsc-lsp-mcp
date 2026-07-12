import { workspace } from 'vscode'
import type { LspOperation } from './protocol'

/**
 * 判断某个 LSP 操作是否被启用
 * 对应配置项 `lsp-mcp.operations.<operation>`，默认全开（true）
 * 在 Instance 侧执行 LSP 时调用，故读取的是当前窗口的 workspace 配置
 */
export function isOperationEnabled(operation: LspOperation): boolean {
  return workspace.getConfiguration('lsp-mcp.operations').get<boolean>(operation, true)
}
