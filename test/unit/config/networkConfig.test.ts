import Ajv from 'ajv'
import * as cryptoUtils from '@shardus/lib-crypto-utils'
import oldFields from './networkConfigV2Fields.json'
import SERVER_CONFIG from '../../../src/config/server'
import * as Context from '../../../src/p2p/Context'
import {
  applyNetworkConfig,
  buildLegacyNetworkConfig,
  buildNetworkConfig,
  hashLocalNetworkConfig,
  hashNetConfig,
  selectNetworkConfigField,
  validateNetworkConfig,
} from '../../../src/config/networkConfig'
import { baseNetworkConfigOmissions, ServerMode, StrictServerConfiguration } from '../../../src/shardus/shardus-types'

const copyConfig = (): StrictServerConfiguration => JSON.parse(JSON.stringify(SERVER_CONFIG))

describe('network configuration v2', () => {
  beforeEach(() => {
    ;(Context as any).crypto = {
      hash: (value: unknown) => JSON.stringify(value),
    }
  })

  test('includes every server field except node-local paths, addresses and archivers', () => {
    cryptoUtils.init(SERVER_CONFIG.crypto.hashKey)
    const config = copyConfig()
    for (const optionalFieldsPresent of [true, false]) {
      if (!optionalFieldsPresent) {
        delete config.p2p.factv2
        delete config.p2p.getTxTimestampTimeoutOffset
        delete config.p2p.patchNetworkAccountSyncFixes
      }
      const expected = JSON.parse(JSON.stringify(config))
      delete expected.baseDir
      delete expected.ip
      delete expected.p2p.existingArchivers
      const payload = buildNetworkConfig(config)
      expect(payload).toEqual(expected)
      expect(cryptoUtils.hashObj(payload)).toBe(cryptoUtils.hashObj(expected))
      expect(validateNetworkConfig(payload)).toEqual(payload)
    }
  })

  test('preserves every omitted local setting when applying detached values', () => {
    const target = copyConfig()
    const before = copyConfig()
    const payload = buildNetworkConfig(target)
    payload.debug.devPublicKeys.test = 1
    payload.features.tickets.ticketTypes.push({ type: 'test', enabled: true })
    expect(target.debug.devPublicKeys).toEqual(before.debug.devPublicKeys)
    expect(target.features.tickets.ticketTypes).toEqual(before.features.tickets.ticketTypes)
    applyNetworkConfig(target, payload)
    for (const field of baseNetworkConfigOmissions.server) expect(target[field]).toEqual(before[field])
    for (const section of ['p2p', 'debug'] as const) {
      for (const field of baseNetworkConfigOmissions[section]) {
        expect(target[section][field]).toEqual(before[section][field])
      }
    }
    payload.debug.devPublicKeys.test = 2
    expect(target.debug.devPublicKeys.test).toBe(1)
  })

  test('selects fields in migration order and updates validation', () => {
    const config = copyConfig()
    const originalHash = hashNetConfig(buildNetworkConfig(config))
    selectNetworkConfigField(config, 'p2p.cycleDuration', 'exclude')
    const excluded = buildNetworkConfig(config)
    expect(excluded.p2p).not.toHaveProperty('cycleDuration')
    expect(validateNetworkConfig(excluded)).toEqual(excluded)
    expect(() => validateNetworkConfig({ ...excluded, p2p: { ...excluded.p2p, cycleDuration: 30 } })).toThrow()
    selectNetworkConfigField(config, 'p2p.cycleDuration', 'include')
    expect(hashNetConfig(buildNetworkConfig(config))).toBe(originalHash)
    expect(() => selectNetworkConfigField(config, 'p2p.existingArchivers', 'include')).toThrow('Protected')
    expect(() => selectNetworkConfigField(config, 'p2p.unknownField', 'include')).toThrow('Unknown')
    selectNetworkConfigField(config, 'features.tickets', 'exclude')
    expect(buildNetworkConfig(config).features).not.toHaveProperty('tickets')
    selectNetworkConfigField(config, 'features.tickets', 'include')
    selectNetworkConfigField(config, 'features.tickets.ticketTypes', 'exclude')
    expect(buildNetworkConfig(config).features.tickets).not.toHaveProperty('ticketTypes')
    selectNetworkConfigField(config, 'features.tickets.ticketTypes', 'include')
  })

  test('adopts nested exclusions and optional absence with production hash parity', () => {
    cryptoUtils.init(SERVER_CONFIG.crypto.hashKey)
    ;(Context as any).crypto = { hash: cryptoUtils.hashObj }
    const target = copyConfig()
    target.p2p.netConfigV2 = true
    target.features.tickets.updateTicketListTimeInMs = 1234
    target.debug.devPublicKeys.stale = 1
    selectNetworkConfigField(target, 'features.tickets.updateTicketListTimeInMs', 'exclude')
    try {
      const peer = copyConfig()
      peer.p2p.netConfigV2 = true
      delete peer.p2p.factv2
      const payload = buildNetworkConfig(peer)
      payload.features.tickets.ticketTypes = []
      applyNetworkConfig(target, payload)
      expect(target.features.tickets.updateTicketListTimeInMs).toBe(1234)
      expect(target.features.tickets.ticketTypes).toEqual([])
      expect(target.debug.devPublicKeys).toEqual({})
      expect(target.p2p).not.toHaveProperty('factv2')
      expect(hashLocalNetworkConfig(target)).toBe(hashNetConfig(payload))
    } finally {
      selectNetworkConfigField(copyConfig(), 'features.tickets.updateTicketListTimeInMs', 'include')
    }
  })

  test('uses default types despite unrelated local overrides', () => {
    const local = copyConfig()
    local.p2p.scaleConsensusRequired = 1
    selectNetworkConfigField(local, 'p2p.factv2', 'include')
    expect(() => validateNetworkConfig(buildNetworkConfig(copyConfig()))).not.toThrow()
    const invalid = buildNetworkConfig(copyConfig())
    invalid.p2p.minNodes = 1.5
    expect(() => validateNetworkConfig(invalid)).toThrow('integer')
  })

  test('restores ordered selections after compilation fails', () => {
    const config = copyConfig()
    selectNetworkConfigField(config, 'features.tickets.ticketTypes', 'exclude')
    selectNetworkConfigField(config, 'features.tickets', 'include')
    const before = buildNetworkConfig(config)
    const compile = jest.spyOn(Ajv.prototype, 'compile').mockImplementationOnce(() => {
      throw new Error('compile failed')
    })
    try {
      expect(() => selectNetworkConfigField(config, 'features.tickets.ticketTypes', 'include')).toThrow(
        'compile failed'
      )
      expect(buildNetworkConfig(config)).toEqual(before)
      expect(validateNetworkConfig(before)).toEqual(before)
    } finally {
      compile.mockRestore()
      selectNetworkConfigField(config, 'features.tickets.ticketTypes', 'include')
    }
  })

  test('includes a new local P2P field only after its migration selects it', () => {
    const config = copyConfig() as any
    config.p2p.futureNetworkFlag = true
    selectNetworkConfigField(config, 'p2p.futureNetworkFlag', 'exclude')
    expect(buildNetworkConfig(config).p2p).not.toHaveProperty('futureNetworkFlag')
    const oldLegacyHash = hashNetConfig(buildLegacyNetworkConfig(copyConfig()))
    expect(hashNetConfig(buildLegacyNetworkConfig(config))).not.toBe(oldLegacyHash)
    selectNetworkConfigField(config, 'p2p.futureNetworkFlag', 'include')
    expect(buildNetworkConfig(config).p2p).toHaveProperty('futureNetworkFlag', true)
    expect(validateNetworkConfig(buildNetworkConfig(config))).toHaveProperty('p2p.futureNetworkFlag', true)
    selectNetworkConfigField(config, 'p2p.futureNetworkFlag', 'exclude')
  })

  test('protects only node-local exclusions and publishes the newly shared sections', () => {
    const projected = buildNetworkConfig(copyConfig())
    expect(projected.globalAccount).toBe(SERVER_CONFIG.globalAccount)
    expect(projected.p2p).not.toHaveProperty('existingArchivers')
    expect(projected).not.toHaveProperty('ip')
    expect(projected).not.toHaveProperty('baseDir')
    for (const section of [
      'crypto',
      'network',
      'reporting',
      'mode',
      'statistics',
      'loadDetection',
      'rateLimiting',
      'debug',
    ] as const) {
      expect(projected[section]).toEqual(SERVER_CONFIG[section])
    }
    expect(projected.p2p.netConfigV2).toBe(SERVER_CONFIG.p2p.netConfigV2)
    expect(projected.p2p.networkConfigHashEnforcement).toBe(SERVER_CONFIG.p2p.networkConfigHashEnforcement)
    for (const field of ['baseDir', 'ip', 'ip.externalPort', 'p2p.existingArchivers']) {
      expect(() => selectNetworkConfigField(copyConfig(), field, 'include')).toThrow('Protected')
    }
  })

  test('adopts newly shared settings while preserving differing node-local values and the production hash', () => {
    cryptoUtils.init(SERVER_CONFIG.crypto.hashKey)
    ;(Context as any).crypto = { hash: cryptoUtils.hashObj }
    const target = copyConfig()
    target.baseDir = '/local/node'
    target.ip.externalPort = 9999
    target.p2p.existingArchivers = []
    const peer = copyConfig()
    peer.p2p.netConfigV2 = true
    peer.p2p.networkConfigHashEnforcement = true
    peer.crypto.keyPairConfig.keyPairJsonFile = 'network-secrets.json'
    peer.network.timeout = 12
    peer.reporting.interval = 9
    peer.mode = ServerMode.Debug
    peer.statistics.save = !target.statistics.save
    peer.loadDetection.queueLimit = 123
    peer.rateLimiting.limitRate = !target.rateLimiting.limitRate
    peer.debug.profiler = !target.debug.profiler
    const payload = buildNetworkConfig(peer)
    applyNetworkConfig(target, payload)
    for (const section of [
      'crypto',
      'network',
      'reporting',
      'mode',
      'statistics',
      'loadDetection',
      'rateLimiting',
      'debug',
    ] as const) {
      expect(target[section]).toEqual(peer[section])
    }
    expect(target.p2p.netConfigV2).toBe(true)
    expect(target.p2p.networkConfigHashEnforcement).toBe(true)
    expect(target.baseDir).toBe('/local/node')
    expect(target.ip.externalPort).toBe(9999)
    expect(target.p2p.existingArchivers).toEqual([])
    expect(hashLocalNetworkConfig(target)).toBe(hashNetConfig(payload))
  })

  test('accepts fractional debug probabilities while rejecting wrong types and fractional counters', () => {
    const payload = buildNetworkConfig(copyConfig())
    const chances = Object.keys(SERVER_CONFIG.debug).filter((key) => key.endsWith('Chance'))
    for (const key of chances) payload.debug[key] = 0.25
    expect(() => validateNetworkConfig(payload)).not.toThrow()
    payload.debug.loseTxChance = '0.25' as any
    expect(() => validateNetworkConfig(payload)).toThrow('number')
    payload.debug.loseTxChance = 0.25
    payload.debug.debugStatListMaxSize = 1.5
    expect(() => validateNetworkConfig(payload)).toThrow('integer')
  })

  test('keeps explicitly excluded debug probabilities out of validation', () => {
    const config = copyConfig()
    selectNetworkConfigField(config, 'debug.loseTxChance', 'exclude')
    try {
      const payload = buildNetworkConfig(config)
      expect(validateNetworkConfig(payload).debug).not.toHaveProperty('loseTxChance')
      payload.debug.loseTxChance = 0.25
      expect(() => validateNetworkConfig(payload)).toThrow('additional properties')
    } finally {
      selectNetworkConfigField(config, 'debug.loseTxChance', 'include')
    }
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

  test('rejects excluded fields at every boundary', () => {
    for (const field of baseNetworkConfigOmissions.server) {
      const payload = buildNetworkConfig(copyConfig()) as any
      payload[field] = SERVER_CONFIG[field]
      expect(() => validateNetworkConfig(payload)).toThrow('Invalid network configuration')
    }
    for (const section of ['p2p', 'debug'] as const) {
      for (const field of baseNetworkConfigOmissions[section]) {
        const payload = buildNetworkConfig(copyConfig()) as any
        payload[section][field] = SERVER_CONFIG[section][field] ?? true
        expect(() => validateNetworkConfig(payload)).toThrow('Invalid network configuration')
      }
    }
  })

  test('removes governed optional P2P values when the payload omits them', () => {
    const target = copyConfig()
    const payload = buildNetworkConfig(target)
    for (const field of ['factv2', 'getTxTimestampTimeoutOffset', 'patchNetworkAccountSyncFixes'] as const) {
      delete payload.p2p[field]
    }
    applyNetworkConfig(target, payload)
    for (const field of ['factv2', 'getTxTimestampTimeoutOffset', 'patchNetworkAccountSyncFixes'] as const) {
      expect(target.p2p).not.toHaveProperty(field)
    }
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

  test.each(['rotationCountMultiply', 'extraCyclesToKeepMultiplier'] as const)(
    '%s stays excluded until re-inclusion restores fractional validation',
    (field) => {
      const config = copyConfig()
      selectNetworkConfigField(config, `p2p.${field}`, 'exclude')
      try {
        const excluded = buildNetworkConfig(config)
        expect(validateNetworkConfig(excluded).p2p).not.toHaveProperty(field)
        excluded.p2p[field] = 0.5
        expect(() => validateNetworkConfig(excluded)).toThrow('additional properties')
      } finally {
        selectNetworkConfigField(config, `p2p.${field}`, 'include')
      }
      const included = buildNetworkConfig(config)
      included.p2p[field] = 0.5
      expect(validateNetworkConfig(included).p2p[field]).toBe(0.5)
      included.p2p[field] = '0.5' as any
      expect(() => validateNetworkConfig(included)).toThrow('should be number')
    }
  )

  test.each([true, false])('matches original selection and previous hashes (optional fields present=%s)', (present) => {
    cryptoUtils.init(SERVER_CONFIG.crypto.hashKey)
    const config = copyConfig()
    config.p2p.netConfigV2 = false
    if (!present) {
      delete config.p2p.factv2
      delete config.p2p.getTxTimestampTimeoutOffset
      delete config.p2p.patchNetworkAccountSyncFixes
    }
    // Baseline 397192364: P2P copied every field except local archivers; exclude the two later flags too.
    const expected: Record<string, any> = Object.fromEntries(
      [
        'crypto',
        'heartbeatInterval',
        'loadDetection',
        'network',
        'rateLimiting',
        'sharding',
        'transactionExpireTime',
        'p2p',
        'stateManager',
        'debug',
      ].map((field) => [field, config[field]])
    )
    expected.p2p = { ...config.p2p }
    delete expected.p2p.existingArchivers
    delete expected.p2p.netConfigV2
    delete expected.p2p.networkConfigHashEnforcement
    const previous = {
      ...expected,
      p2p: Object.fromEntries(
        oldFields.P2P_FIELDS.filter((field) => config.p2p[field] !== undefined).map((field) => [
          field,
          config.p2p[field],
        ])
      ),
    }
    const payload = buildLegacyNetworkConfig(config)
    expect(payload).toEqual(expected)
    expect(payload).toEqual(previous)
    expect(cryptoUtils.hashObj(payload)).toBe(cryptoUtils.hashObj(expected))
    expect(cryptoUtils.hashObj(payload)).toBe(cryptoUtils.hashObj(previous))
  })

  test('original builder includes new P2P fields and returns detached values', () => {
    const config = copyConfig()
    ;(config.p2p as any).futureNetworkFlag = { enabled: true }
    const payload = buildLegacyNetworkConfig(config) as any
    expect(payload.p2p.futureNetworkFlag).toEqual({ enabled: true })
    payload.p2p.futureNetworkFlag.enabled = false
    payload.debug.devPublicKeys.test = 1
    payload.crypto.hashKey = 'changed'
    expect((config.p2p as any).futureNetworkFlag.enabled).toBe(true)
    expect(config.debug.devPublicKeys).toEqual(SERVER_CONFIG.debug.devPublicKeys)
    expect(config.crypto.hashKey).toBe(SERVER_CONFIG.crypto.hashKey)
    expect(config.p2p.existingArchivers).toEqual(SERVER_CONFIG.p2p.existingArchivers)
  })

  test.each([false, true, undefined])(
    'selects the same payload for hashing and publishing (netConfigV2=%s)',
    (enabled) => {
      const config = copyConfig()
      config.p2p.netConfigV2 = enabled
      const payload = config.p2p.netConfigV2 ? buildNetworkConfig(config) : buildLegacyNetworkConfig(config)
      expect(hashLocalNetworkConfig(config)).toBe(hashNetConfig(payload))
    }
  )

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
    expect(hashLocalNetworkConfig(config)).toBe(hashNetConfig(payload))
  })

  test('legacy ignores selector flags while v2 commits to them and preserves node-local hash independence', () => {
    const legacy = copyConfig()
    legacy.p2p.netConfigV2 = false
    const legacyHash = hashLocalNetworkConfig(legacy)
    legacy.p2p.networkConfigHashEnforcement = !legacy.p2p.networkConfigHashEnforcement
    legacy.p2p.existingArchivers = []
    expect(hashLocalNetworkConfig(legacy)).toBe(legacyHash)

    const v2 = copyConfig()
    v2.p2p.netConfigV2 = true
    const v2Hash = hashLocalNetworkConfig(v2)
    v2.baseDir = '/another/node'
    v2.ip.externalPort = 9999
    v2.p2p.existingArchivers = []
    expect(hashLocalNetworkConfig(v2)).toBe(v2Hash)
    v2.p2p.networkConfigHashEnforcement = !v2.p2p.networkConfigHashEnforcement
    expect(hashLocalNetworkConfig(v2)).not.toBe(v2Hash)
    v2.p2p.networkConfigHashEnforcement = !v2.p2p.networkConfigHashEnforcement
    v2.p2p.netConfigV2 = false
    expect(hashNetConfig(buildNetworkConfig(v2))).not.toBe(v2Hash)
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
    expect(hashNetConfig(buildNetworkConfig(config))).toBe(hashLocalNetworkConfig(config))
  })
})
