import * as vscode from 'vscode'
import { DiagnosticFilters, DiagnosticItem, getDiagnostics, isUnderTarget } from './diagnostics'
import { resolveUri } from './tools'

/** refresh 操作返回的稳定状态 */
export interface RefreshStatus {
  /**
   * - stable：诊断已稳定、可信，可据此判断代码改动是否消除了目标问题。
   * - in_progress：达到 timeoutMs 仍未稳定，可能尚未反映最新代码；
   *   返回的仍是当前累积诊断，调用方可再次调用续等（诊断全局累积，不浪费）。
   */
  state: 'stable' | 'in_progress'
  /** 本次等待已耗用的毫秒数 */
  elapsedMs: number
}

const DEFAULT_FILE_TIMEOUT_MS = 10_000
const DEFAULT_WORKSPACE_TIMEOUT_MS = 25_000
const DEFAULT_SETTLE_MS = 500
/** 起步延迟：给 LSP 开始响应的时间，防改完瞬间读到旧诊断误判 stable */
const MIN_DELAY_MS = 300

/**
 * 刷新并等待诊断稳定后读取（供 diagnostics_refresh / workspace_diagnostics_refresh 调用）。
 *
 * 关键前提：VSCode 的 DiagnosticCollection 是全局、按 URI 累积的，诊断分析由 LSP
 * 在后台持续进行。故本工具只做"确保同步 + 等待后台分析达到稳定 + 读取结果"，
 * 多次调用读取的是同一个持续进行的后台过程——重试不浪费，第二轮接续第一轮进展。
 *
 * - 单文件：先 openTextDocument 确保文档被 LSP 关注/同步（幂等，不重复触发），
 *   再监听 onDidChangeDiagnostics 等其稳定。
 * - 工作区：无通用触发手段，仅监听当前分析沉淀。
 *
 * 超时不是错误：返回当前累积诊断 + state=in_progress，调用方可续调。
 */
export async function refreshDiagnostics(
  uri: string,
  workspaceScope: boolean,
  filters: DiagnosticFilters = {},
  timeoutMs?: number,
  settleMs: number = DEFAULT_SETTLE_MS,
): Promise<{ items: DiagnosticItem[], status: RefreshStatus }> {
  const target = resolveUri(uri)

  // 1. 触发同步（仅单文件）：确保文档被 LSP 关注/同步最新内容。openTextDocument 幂等。
  if (!workspaceScope)
    // openTextDocument 返回 Thenable，包成 Promise 才能安全 catch，避免文档丢失等异常抛出
    await Promise.resolve(vscode.workspace.openTextDocument(target)).catch(() => {})

  // 2. 等待诊断稳定
  const effectiveTimeout = timeoutMs ?? (workspaceScope ? DEFAULT_WORKSPACE_TIMEOUT_MS : DEFAULT_FILE_TIMEOUT_MS)
  const status = await waitForDiagnosticsSettle(target, workspaceScope, effectiveTimeout, settleMs)

  // 3. 读取当前累积诊断
  const items = getDiagnostics(uri, workspaceScope, filters)
  return { items, status }
}

/**
 * 监听诊断变更事件，等待目标范围内的诊断"稳定"
 * （自上次变更起连续 settleMs 无新变化，且已过起步延迟）。
 * 达到 timeoutMs 仍未稳定则返回 in_progress。结束时必定 dispose 监听器以防泄漏。
 */
async function waitForDiagnosticsSettle(
  target: vscode.Uri,
  workspaceScope: boolean,
  timeoutMs: number,
  settleMs: number,
): Promise<RefreshStatus> {
  const start = Date.now()
  let lastChangeAt = start

  const sub = vscode.languages.onDidChangeDiagnostics((event) => {
    const hit = workspaceScope
      ? event.uris.some(uri => isUnderTarget(uri, target))
      : event.uris.some(uri => uri.toString() === target.toString())
    if (hit)
      lastChangeAt = Date.now()
  })

  try {
    while (Date.now() - start < timeoutMs) {
      const now = Date.now()
      const sinceChange = now - lastChangeAt
      const sinceStart = now - start
      // 稳定判定：距上次变化已过 settleMs，且已过起步延迟
      if (sinceChange >= settleMs && sinceStart >= MIN_DELAY_MS)
        return { state: 'stable', elapsedMs: now - start }
      await sleep(50)
    }
    return { state: 'in_progress', elapsedMs: Date.now() - start }
  }
  finally {
    sub.dispose()
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
