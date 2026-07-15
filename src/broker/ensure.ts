import type { ExtensionContext } from 'vscode'
import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import pkg from '../../package.json'
import { getRegistryRoot } from '../instance/registry'
import {
  BROKER_PROTOCOL_VERSION,
  brokerLockPath,
  readBrokerState,
  removeBrokerState,
} from './state'

const BROKER_START_TIMEOUT_MS = 5_000

/**
 * 复用已运行的共享 Broker，或启动一个与 VS Code 窗口解耦的后台进程
 * @returns 外部 MCP 客户端应连接的实际端口
 */
export async function ensureBroker(
  context: ExtensionContext,
  options: BrokerLaunchOptions,
): Promise<number> {
  const registryRoot = getRegistryRoot()
  const expectedVersion = pkg.version
  const activePort = await activeBrokerPort(registryRoot, expectedVersion)
  if (activePort != null)
    return activePort

  // 健康检查失败或版本不匹配时，先回收旧 Broker，避免锁/端口卡住新进程
  await reclaimMismatchedBroker(registryRoot, expectedVersion)

  const brokerPath = context.asAbsolutePath('dist/broker.js')
  for (let attempt = 0; attempt < 2; attempt++) {
    const activePort = await activeBrokerPort(registryRoot, expectedVersion)
    if (activePort != null)
      return activePort

    spawnBroker(brokerPath, registryRoot, options)
    const deadline = Date.now() + BROKER_START_TIMEOUT_MS
    while (Date.now() < deadline) {
      const port = await activeBrokerPort(registryRoot, expectedVersion)
      if (port != null)
        return port
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  throw new Error('Timed out waiting for the LSP MCP broker to start')
}

function spawnBroker(path: string, registryRoot: string, options: BrokerLaunchOptions): void {
  const child = spawn(process.execPath, [path], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      VSC_LSP_MCP_REGISTRY: registryRoot,
      VSC_LSP_MCP_PORT: String(options.port),
      VSC_LSP_MCP_CORS_ENABLED: String(options.corsEnabled),
      VSC_LSP_MCP_CORS_ORIGINS: options.corsOrigins,
      VSC_LSP_MCP_CORS_CREDENTIALS: String(options.corsCredentials),
      VSC_LSP_MCP_CORS_EXPOSE_HEADERS: options.corsExposeHeaders,
      VSC_LSP_MCP_LOCALE: options.locale,
    },
  })
  child.unref()
}

/** 启动共享 Broker 所需的运行参数 */
export interface BrokerLaunchOptions {
  port: number
  corsEnabled: boolean
  corsOrigins: string
  corsCredentials: boolean
  corsExposeHeaders: string
  locale: string
}

/** 判断运行中的 Broker 是否与当前扩展版本兼容，可被复用 */
export function isCompatibleBrokerHealth(
  health: { protocolVersion?: number, version?: string },
  expectedVersion: string,
): boolean {
  return health.protocolVersion === BROKER_PROTOCOL_VERSION
    && health.version === expectedVersion
}

async function activeBrokerPort(
  registryRoot: string,
  expectedVersion: string,
): Promise<number | undefined> {
  const state = await readBrokerState(registryRoot)
  if (!state)
    return undefined

  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/health`, {
      signal: AbortSignal.timeout(500),
    })
    const health = await response.json() as { protocolVersion?: number, version?: string }
    if (response.ok && isCompatibleBrokerHealth(health, expectedVersion))
      return state.port
  }
  catch {}

  return undefined
}

/**
 * 回收协议版本或扩展版本不匹配、或已无响应的旧 Broker
 * 旧版本只写 protocolVersion、不写 version，也会被这里识别并替换
 */
async function reclaimMismatchedBroker(
  registryRoot: string,
  expectedVersion: string,
): Promise<void> {
  const state = await readBrokerState(registryRoot)
  if (!state)
    return

  // 若仍是兼容版本则不碰
  if (await activeBrokerPort(registryRoot, expectedVersion) != null)
    return

  if (state.pid > 0) {
    try {
      process.kill(state.pid)
    }
    catch {}
  }

  await removeBrokerState(registryRoot, state.pid)
  await rm(brokerLockPath(registryRoot), { force: true }).catch(() => {})

  // 给端口释放一点时间
  await new Promise(resolve => setTimeout(resolve, 100))
}
