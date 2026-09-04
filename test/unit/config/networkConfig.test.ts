import SERVER_CONFIG from '../../../src/config/server'
import { applyNetworkConfig, buildNetworkConfig, validateNetworkConfig } from '../../../src/config/networkConfig'
import { StrictServerConfiguration } from '../../../src/shardus/shardus-types'

const copyConfig = (): StrictServerConfiguration => JSON.parse(JSON.stringify(SERVER_CONFIG))

describe('network configuration v2', () => {
  test('projects approved fields and excludes bootstrap, local, and selector fields', () => {
    const projected = buildNetworkConfig(copyConfig())
    expect(projected.globalAccount).toBe(SERVER_CONFIG.globalAccount)
    expect(projected.p2p).not.toHaveProperty('existingArchivers')
    expect(projected.p2p).not.toHaveProperty('netConfigV2')
    expect(projected.p2p).not.toHaveProperty('networkConfigHashEnforcement')
    expect(projected).not.toHaveProperty('crypto')
    expect(projected).not.toHaveProperty('network')
    expect(projected).not.toHaveProperty('loadDetection')
    expect(projected).not.toHaveProperty('rateLimiting')
    expect(projected.debug).toEqual({ devPublicKeys: {}, multisigKeys: {} })
  })

  test('returns detached projections', () => {
    const config = copyConfig()
    const first = buildNetworkConfig(config)
    const second = buildNetworkConfig(config)
    expect(first).not.toBe(second)
    expect(first.p2p).not.toBe(second.p2p)
    ;(first.p2p as any).cycleDuration = 999
    expect(second.p2p.cycleDuration).toBe(SERVER_CONFIG.p2p.cycleDuration)
    expect(config.p2p.cycleDuration).toBe(SERVER_CONFIG.p2p.cycleDuration)
  })

  test('rejects missing and unknown fields', () => {
    const missing = buildNetworkConfig(copyConfig()) as any
    delete missing.features
    expect(() => validateNetworkConfig(missing)).toThrow('Invalid network configuration')

    const unknown = buildNetworkConfig(copyConfig()) as any
    unknown.p2p.unapprovedFutureDefault = true
    expect(() => validateNetworkConfig(unknown)).toThrow('Invalid network configuration')
  })

  test('applies approved values without replacing local sections or sharing references', () => {
    const target = copyConfig()
    const existingArchivers = target.p2p.existingArchivers
    const approved = buildNetworkConfig(target)
    approved.p2p.cycleDuration = 77
    applyNetworkConfig(target, approved)
    expect(target.p2p.cycleDuration).toBe(77)
    expect(target.p2p.existingArchivers).toBe(existingArchivers)
    approved.p2p.cycleDuration = 88
    expect(target.p2p.cycleDuration).toBe(77)
  })
})
