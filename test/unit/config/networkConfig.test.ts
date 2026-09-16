import SERVER_CONFIG from '../../../src/config/server'
import * as Context from '../../../src/p2p/Context'
import {
  applyNetworkConfig,
  buildLegacyNetworkConfig,
  buildNetworkConfig,
  hashNetworkConfig,
  hashNetworkConfigPayload,
  validateNetworkConfig,
} from '../../../src/config/networkConfig'
import { StrictServerConfiguration } from '../../../src/shardus/shardus-types'

const copyConfig = (): StrictServerConfiguration => JSON.parse(JSON.stringify(SERVER_CONFIG))

describe('network configuration v2', () => {
  beforeEach(() => {
    ;(Context as any).crypto = {
      hash: (value: unknown) => JSON.stringify(value),
    }
  })

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

  test('preserves numeric type and integer count validation', () => {
    const payload = buildNetworkConfig(copyConfig())
    ;(payload.p2p as any).rotationCountMultiply = '0.5'
    expect(() => validateNetworkConfig(payload)).toThrow('should be number')
    payload.p2p.rotationCountMultiply = 0.5
    payload.p2p.minNodes = 1.5
    expect(() => validateNetworkConfig(payload)).toThrow('should be integer')
  })

  test('uses legacy payload hashing when netConfigV2 is disabled', () => {
    const config = copyConfig()
    config.p2p.netConfigV2 = false
    const payload = buildLegacyNetworkConfig(config)
    expect(payload).toHaveProperty('crypto')
    expect(payload).toHaveProperty('network')
    expect(payload).toHaveProperty('loadDetection')
    expect(payload).toHaveProperty('rateLimiting')
    expect(payload.p2p as Record<string, unknown>).not.toHaveProperty('existingArchivers')
    expect(payload.p2p as Record<string, unknown>).not.toHaveProperty('netConfigV2')
    expect(payload.p2p as Record<string, unknown>).not.toHaveProperty('networkConfigHashEnforcement')
    expect(hashNetworkConfig(config)).toBe(hashNetworkConfigPayload(payload))
  })

  test('selector flag changes do not alter legacy or v2 hashes', () => {
    const legacy = copyConfig()
    legacy.p2p.netConfigV2 = false
    const legacyHash = hashNetworkConfig(legacy)
    legacy.p2p.networkConfigHashEnforcement = !legacy.p2p.networkConfigHashEnforcement
    legacy.p2p.existingArchivers = []
    expect(hashNetworkConfig(legacy)).toBe(legacyHash)

    const v2 = copyConfig()
    v2.p2p.netConfigV2 = true
    const v2Hash = hashNetworkConfig(v2)
    v2.p2p.networkConfigHashEnforcement = !v2.p2p.networkConfigHashEnforcement
    v2.p2p.existingArchivers = []
    v2.p2p.netConfigV2 = false
    expect(hashNetworkConfigPayload(buildNetworkConfig(v2))).toBe(v2Hash)
  })

  test('omits absent optional fields without throwing', () => {
    const config = copyConfig() as any
    delete config.p2p.factv2
    const projected = buildNetworkConfig(config)
    expect(projected.p2p).not.toHaveProperty('factv2')
    expect(() => validateNetworkConfig(projected)).not.toThrow()
  })

  test('payload hash and full-config hash agree for active v2 values', () => {
    const config = copyConfig()
    config.p2p.netConfigV2 = true
    expect(hashNetworkConfigPayload(buildNetworkConfig(config))).toBe(hashNetworkConfig(config))
  })
})
