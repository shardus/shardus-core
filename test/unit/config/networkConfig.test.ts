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
  refreshNetworkConfigSchema,
  selectNetworkConfigField,
  validateNetworkConfig,
} from '../../../src/config/networkConfig'
import { baseNetworkConfigOmissions, StrictServerConfiguration } from '../../../src/shardus/shardus-types'

const copyConfig = (): StrictServerConfiguration => JSON.parse(JSON.stringify(SERVER_CONFIG))

describe('network configuration v2', () => {
  beforeEach(() => {
    ;(Context as any).crypto = {
      hash: (value: unknown) => JSON.stringify(value),
    }
  })

  test('governs the whole server config except node-local fields, with production hash parity', () => {
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
      delete expected.crypto
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
      peer.p2p.netConfigV2 = true // only a V2 peer serves a V2 payload
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
    ;(invalid.p2p as any).minNodes = '15'
    expect(() => validateNetworkConfig(invalid)).toThrow('should be number')
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

  test('rejects selecting inside an array but allows selecting the array as a whole', () => {
    const config = copyConfig()
    expect(() => selectNetworkConfigField(config, 'features.tickets.ticketTypes.0.enabled', 'exclude')).toThrow(
      'Array elements cannot be selected'
    )
    expect(() => selectNetworkConfigField(config, 'features.tickets.ticketTypes.0', 'exclude')).toThrow(
      'Array elements cannot be selected'
    )
    selectNetworkConfigField(config, 'features.tickets.ticketTypes', 'exclude')
    try {
      const payload = buildNetworkConfig(config)
      expect(payload.features.tickets).not.toHaveProperty('ticketTypes')
      expect(() => validateNetworkConfig(payload)).not.toThrow()
    } finally {
      selectNetworkConfigField(config, 'features.tickets.ticketTypes', 'include')
    }
  })

  test('a selected path whose parent is missing neither throws nor creates empty parents', () => {
    const config = copyConfig()
    selectNetworkConfigField(config, 'features.tickets.ticketTypes', 'include')
    selectNetworkConfigField(config, 'features.tickets.updateTicketListTimeInMs', 'exclude')
    try {
      const withoutTickets = copyConfig() as any
      delete withoutTickets.features.tickets
      let payload: any
      expect(() => (payload = buildNetworkConfig(withoutTickets))).not.toThrow()
      expect(payload.features).not.toHaveProperty('tickets')
      const withoutFeatures = copyConfig() as any
      delete withoutFeatures.features
      expect(() => (payload = buildNetworkConfig(withoutFeatures))).not.toThrow()
      expect(payload).not.toHaveProperty('features')
    } finally {
      selectNetworkConfigField(config, 'features.tickets.updateTicketListTimeInMs', 'include')
    }
  })

  test('refreshes the schema from the migrated config, so migrated values are expected from peers', () => {
    const migrated = copyConfig() as any
    migrated.p2p.migratedFlag = true // e.g. assigned by an app migration, with no selection call
    expect(() => validateNetworkConfig(buildNetworkConfig(migrated))).toThrow('should NOT have additional properties')
    refreshNetworkConfigSchema(migrated)
    try {
      expect(() => validateNetworkConfig(buildNetworkConfig(migrated))).not.toThrow()
    } finally {
      refreshNetworkConfigSchema(copyConfig())
    }
    expect(() => validateNetworkConfig(buildNetworkConfig(copyConfig()))).not.toThrow()
  })

  test('excludes only node-local fields and governs everything else', () => {
    const projected = buildNetworkConfig(copyConfig()) as any
    expect(projected).not.toHaveProperty('baseDir')
    expect(projected).not.toHaveProperty('crypto')
    expect(projected).not.toHaveProperty('ip')
    expect(projected.p2p).not.toHaveProperty('existingArchivers')
    expect(projected.globalAccount).toBe(SERVER_CONFIG.globalAccount)
    expect(projected.p2p.netConfigV2).toBe(SERVER_CONFIG.p2p.netConfigV2)
    expect(projected.p2p.networkConfigHashEnforcement).toBe(SERVER_CONFIG.p2p.networkConfigHashEnforcement)
    for (const section of ['network', 'reporting', 'mode', 'statistics', 'loadDetection', 'rateLimiting']) {
      expect(projected[section]).toEqual(SERVER_CONFIG[section])
    }
    expect(projected.debug).toEqual(SERVER_CONFIG.debug)
  })

  test.each<[string, (config: any) => void]>([
    ['debug', (config) => (config.debug.profiler = !config.debug.profiler)],
    ['debug governance keys', (config) => (config.debug.multisigKeys.someKey = 1)],
    ['network', (config) => (config.network.timeout += 1)],
    ['reporting', (config) => (config.reporting.recipient = 'http://other-monitor/api')],
    ['mode', (config) => (config.mode = config.mode === 'debug' ? 'release' : 'debug')],
    ['statistics', (config) => (config.statistics.save = !config.statistics.save)],
    ['loadDetection', (config) => (config.loadDetection.queueLimit += 1)],
    ['rateLimiting', (config) => (config.rateLimiting.limitRate = !config.rateLimiting.limitRate)],
    [
      'enforcement flag',
      (config) => (config.p2p.networkConfigHashEnforcement = !config.p2p.networkConfigHashEnforcement),
    ],
  ])('changing %s changes the V2 hash', (_name, change) => {
    const config = copyConfig()
    config.p2p.netConfigV2 = true
    const before = hashLocalNetworkConfig(config)
    change(config)
    expect(hashLocalNetworkConfig(config)).not.toBe(before)
  })

  test.each<[string, (config: any) => void]>([
    ['baseDir', (config) => (config.baseDir = '/elsewhere')],
    ['crypto', (config) => (config.crypto.keyPairConfig.keyPairJsonFile = 'other-secrets.json')],
    ['ip', (config) => (config.ip.externalPort += 1)],
    ['existingArchivers', (config) => (config.p2p.existingArchivers = [])],
  ])('changing node-local %s does not change the V2 hash', (_name, change) => {
    const config = copyConfig()
    config.p2p.netConfigV2 = true
    const before = hashLocalNetworkConfig(config)
    change(config)
    expect(hashLocalNetworkConfig(config)).toBe(before)
  })

  test('accepts any finite number regardless of the default and protects node-local paths from selection', () => {
    const payload = buildNetworkConfig(copyConfig()) as any
    // Integer defaults (0, 1, 15) do not make the schema reject fractions the network committed to.
    payload.debug.loseTxChance = 0.25
    payload.p2p.rotationCountMultiply = 0.5
    payload.p2p.minNodes = 1.5
    expect(() => validateNetworkConfig(payload)).not.toThrow()
    payload.debug.loseTxChance = '0.25'
    expect(() => validateNetworkConfig(payload)).toThrow('Invalid network configuration')
    expect(() => selectNetworkConfigField(copyConfig(), 'crypto.hashKey', 'exclude')).toThrow('Protected')
    expect(() => selectNetworkConfigField(copyConfig(), 'ip.externalIp', 'include')).toThrow('Protected')
  })

  test.each([
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['NaN', NaN],
  ])('rejects a non-finite number (%s) before cloning would turn it into null', (_name, value) => {
    const payload = buildNetworkConfig(copyConfig()) as any
    payload.p2p.cycleDuration = value
    expect(() => validateNetworkConfig(payload)).toThrow('.p2p.cycleDuration is not finite')
    // A JSON body such as {"timeout":1e309} parses to Infinity.
    const parsed = JSON.parse(
      JSON.stringify(buildNetworkConfig(copyConfig())).replace('"timeout":5', '"timeout":1e309')
    )
    expect(parsed.network.timeout).toBe(Infinity)
    expect(() => validateNetworkConfig(parsed)).toThrow('.network.timeout is not finite')
  })

  test('keeps the explicit DevSecurityLevel schema for governance key maps', () => {
    const payload = buildNetworkConfig(copyConfig()) as any
    payload.debug.multisigKeys.someKey = 3
    expect(() => validateNetworkConfig(payload)).not.toThrow()
    payload.debug.multisigKeys.someKey = 2.5
    expect(() => validateNetworkConfig(payload)).toThrow('Invalid network configuration')
    payload.debug.multisigKeys.someKey = 999
    expect(() => validateNetworkConfig(payload)).toThrow('Invalid network configuration')
  })

  test('an excluded fractional field stays out of the schema', () => {
    const config = copyConfig()
    selectNetworkConfigField(config, 'p2p.rotationCountMultiply', 'exclude')
    try {
      const payload = buildNetworkConfig(config) as any
      expect(payload.p2p).not.toHaveProperty('rotationCountMultiply')
      expect(() => validateNetworkConfig(payload)).not.toThrow()
      payload.p2p.rotationCountMultiply = 0.5
      expect(() => validateNetworkConfig(payload)).toThrow('should NOT have additional properties')
    } finally {
      selectNetworkConfigField(config, 'p2p.rotationCountMultiply', 'include')
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

  test('checks basic types but not integer-ness inferred from defaults', () => {
    const payload = buildNetworkConfig(copyConfig())
    ;(payload.p2p as any).rotationCountMultiply = '0.5'
    expect(() => validateNetworkConfig(payload)).toThrow('should be number')
    payload.p2p.rotationCountMultiply = 0.5
    payload.p2p.minNodes = 1.5
    expect(() => validateNetworkConfig(payload)).not.toThrow()
  })

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

  test('selector flags stay out of the legacy hash but are governed in V2', () => {
    const legacy = copyConfig()
    legacy.p2p.netConfigV2 = false
    const legacyHash = hashLocalNetworkConfig(legacy)
    legacy.p2p.networkConfigHashEnforcement = !legacy.p2p.networkConfigHashEnforcement
    legacy.p2p.existingArchivers = []
    expect(hashLocalNetworkConfig(legacy)).toBe(legacyHash)

    const v2 = copyConfig()
    v2.p2p.netConfigV2 = true
    const v2Hash = hashLocalNetworkConfig(v2)
    v2.p2p.existingArchivers = []
    expect(hashLocalNetworkConfig(v2)).toBe(v2Hash)
    v2.p2p.networkConfigHashEnforcement = !v2.p2p.networkConfigHashEnforcement
    expect(hashLocalNetworkConfig(v2)).not.toBe(v2Hash)
    // The selector itself is in the V2 payload. Hash the payload directly: setting the selector false
    // would otherwise switch hashLocalNetworkConfig to legacy hashing.
    const selector = copyConfig()
    selector.p2p.netConfigV2 = true
    const selectorOn = hashNetConfig(buildNetworkConfig(selector))
    selector.p2p.netConfigV2 = false
    expect(hashNetConfig(buildNetworkConfig(selector))).not.toBe(selectorOn)
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
