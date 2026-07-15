import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 收集 onDidChangeDiagnostics 注册的回调，测试中手动触发以模拟 LSP 推送诊断 */
const { diagListeners, dispose, getDiagnosticsMock, onDidChangeDiagnostics } = vi.hoisted(() => {
  const diagListeners: Array<(e: { uris: Array<{ toString: () => string }> }) => void> = []
  const dispose = vi.fn()
  const onDidChangeDiagnostics = vi.fn((cb: (e: { uris: Array<{ toString: () => string }> }) => void) => {
    diagListeners.push(cb)
    return { dispose }
  })
  const getDiagnosticsMock = vi.fn(() => [])
  return { diagListeners, dispose, getDiagnosticsMock, onDidChangeDiagnostics }
})

vi.mock('vscode', () => ({
  workspace: { openTextDocument: vi.fn(async () => ({})) },
  languages: { onDidChangeDiagnostics },
}))

vi.mock('./diagnostics', () => ({
  getDiagnostics: getDiagnosticsMock,
  isUnderTarget: vi.fn(() => true),
}))

vi.mock('./tools', () => ({
  resolveUri: vi.fn(() => ({ toString: () => '/code/main.ts' })),
}))

function fireChange(): void {
  for (const cb of diagListeners)
    cb({ uris: [{ toString: () => '/code/main.ts' }] })
}

describe('refreshDiagnostics', () => {
  beforeEach(() => {
    diagListeners.length = 0
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns stable after diagnostics stop changing for settleMs', async () => {
    const { refreshDiagnostics } = await import('./diagnosticsRefresh')

    const promise = refreshDiagnostics('/code/main.ts', false, {}, 10_000, 500)
    // 不再触发任何变更；推进到满足 minDelayMs(300) + settleMs(500) 之后判稳定
    await vi.advanceTimersByTimeAsync(700)
    const result = await promise

    expect(result.status.state).toBe('stable')
    expect(getDiagnosticsMock).toHaveBeenCalled()
  })

  it('returns in_progress when changes keep arriving until timeoutMs', async () => {
    const { refreshDiagnostics } = await import('./diagnosticsRefresh')

    const promise = refreshDiagnostics('/code/main.ts', false, {}, 2_000, 500)
    // 每 200ms 触发一次变更（小于 settleMs），使诊断永远无法稳定，直到 timeoutMs
    for (let i = 0; i < 12; i++) {
      await vi.advanceTimersByTimeAsync(200)
      fireChange()
    }
    const result = await promise

    expect(result.status.state).toBe('in_progress')
  })

  it('disposes the diagnostics listener to avoid leaks', async () => {
    const { refreshDiagnostics } = await import('./diagnosticsRefresh')

    const promise = refreshDiagnostics('/code/main.ts', false, {}, 1_000, 500)
    await vi.advanceTimersByTimeAsync(1_200)
    await promise

    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
