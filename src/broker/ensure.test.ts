import { describe, expect, it } from 'vitest'
import { isCompatibleBrokerHealth } from './ensure'
import { BROKER_PROTOCOL_VERSION } from './state'

describe('broker version compatibility', () => {
  it('accepts matching protocol and package version', () => {
    expect(isCompatibleBrokerHealth({
      protocolVersion: BROKER_PROTOCOL_VERSION,
      version: '0.3.2',
    }, '0.3.2')).toBe(true)
  })

  it('rejects missing package version from old brokers', () => {
    expect(isCompatibleBrokerHealth({
      protocolVersion: BROKER_PROTOCOL_VERSION,
    }, '0.3.2')).toBe(false)
  })

  it('rejects mismatched package version', () => {
    expect(isCompatibleBrokerHealth({
      protocolVersion: BROKER_PROTOCOL_VERSION,
      version: '0.3.0',
    }, '0.3.2')).toBe(false)
  })

  it('rejects mismatched protocol version', () => {
    expect(isCompatibleBrokerHealth({
      protocolVersion: BROKER_PROTOCOL_VERSION + 1,
      version: '0.3.2',
    }, '0.3.2')).toBe(false)
  })
})
