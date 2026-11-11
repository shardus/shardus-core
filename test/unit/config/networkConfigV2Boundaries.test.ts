import * as cryptoUtils from '@shardus/lib-crypto-utils'
import SERVER_CONFIG from '../../../src/config/server'
import * as Context from '../../../src/p2p/Context'
import {
  applyNetworkConfig,
  buildNetworkConfig,
  hashLocalNetworkConfig,
  hashNetConfig,
  selectNetworkConfigField,
} from '../../../src/config/networkConfig'
import { NetworkConfig, ServerMode, StrictServerConfiguration } from '../../../src/shardus/shardus-types'

const copyConfig = (): StrictServerConfiguration => JSON.parse(JSON.stringify(SERVER_CONFIG))

beforeAll(() => {
  cryptoUtils.init(SERVER_CONFIG.crypto.hashKey)
  ;(Context as any).crypto = { hash: cryptoUtils.hashObj }
})

test.each<[string, (config: StrictServerConfiguration) => void]>([
  [
    'crypto',
    (config) => {
      config.crypto.keyPairConfig.keyPairJsonFile = 'other-secrets.json'
    },
  ],
  [
    'network',
    (config) => {
      config.network.timeout = 17
    },
  ],
  [
    'reporting',
    (config) => {
      config.reporting.recipient = 'http://other-monitor/api'
    },
  ],
  [
    'mode',
    (config) => {
      config.mode = ServerMode.Debug
    },
  ],
  [
    'statistics',
    (config) => {
      config.statistics.save = !config.statistics.save
    },
  ],
  [
    'loadDetection',
    (config) => {
      config.loadDetection.queueLimit = 123
    },
  ],
  [
    'rateLimiting',
    (config) => {
      config.rateLimiting.limitRate = !config.rateLimiting.limitRate
    },
  ],
  [
    'debug',
    (config) => {
      config.debug.profiler = !config.debug.profiler
    },
  ],
  [
    'netConfigV2',
    (config) => {
      config.p2p.netConfigV2 = false
    },
  ],
  [
    'networkConfigHashEnforcement',
    (config) => {
      config.p2p.networkConfigHashEnforcement = !config.p2p.networkConfigHashEnforcement
    },
  ],
])('changing %s changes the production V2 payload hash', (_name, change) => {
  const config = copyConfig()
  config.p2p.netConfigV2 = true
  const before = hashNetConfig(buildNetworkConfig(config))
  change(config)
  // Hash the V2 payload directly: setting the selector false otherwise switches to legacy hashing.
  expect(hashNetConfig(buildNetworkConfig(config))).not.toBe(before)
})

test.each<[string, (payload: NetworkConfig) => void]>([
  [
    'missing netConfigV2',
    (payload) => {
      delete payload.p2p.netConfigV2
    },
  ],
  [
    'missing enforcement',
    (payload) => {
      delete payload.p2p.networkConfigHashEnforcement
    },
  ],
  [
    'non-boolean netConfigV2',
    (payload) => {
      payload.p2p.netConfigV2 = 'true' as any
    },
  ],
  [
    'non-boolean enforcement',
    (payload) => {
      payload.p2p.networkConfigHashEnforcement = 1 as any
    },
  ],
  [
    'non-string crypto path',
    (payload) => {
      payload.crypto.keyPairConfig.keyPairJsonFile = 42 as any
    },
  ],
  [
    'unknown reporting field',
    (payload) => {
      ;(payload.reporting as any).unexpected = true
    },
  ],
  [
    'non-numeric debug probability',
    (payload) => {
      payload.debug.loseTxChance = '0.25' as any
    },
  ],
])('rejects %s before applying any shared settings', (_name, invalidate) => {
  const target = copyConfig()
  const before = copyConfig()
  const payload = buildNetworkConfig(target)
  payload.p2p.cycleDuration = 91
  payload.loadDetection.queueLimit = 123
  invalidate(payload)
  expect(() => applyNetworkConfig(target, payload)).toThrow('Invalid network configuration')
  expect(target).toEqual(before)
})

test('a reporting-field migration preserves its local value until re-inclusion', () => {
  const peer = copyConfig()
  peer.p2p.netConfigV2 = true
  peer.reporting.recipient = 'http://network-monitor/api'
  peer.reporting.interval = 7
  const target = copyConfig()
  target.p2p.netConfigV2 = true
  target.reporting.recipient = 'http://local-monitor/api'
  expect(target.reporting.recipient).not.toBe(peer.reporting.recipient)

  selectNetworkConfigField(peer, 'reporting.recipient', 'exclude')
  try {
    const excluded = buildNetworkConfig(peer)
    expect(excluded.reporting).not.toHaveProperty('recipient')
    applyNetworkConfig(target, excluded)
    expect(target.reporting.recipient).toBe('http://local-monitor/api')
    expect(target.reporting.interval).toBe(7)
    expect(hashLocalNetworkConfig(target)).toBe(hashNetConfig(excluded))

    selectNetworkConfigField(peer, 'reporting.recipient', 'include')
    const included = buildNetworkConfig(peer)
    expect(hashNetConfig(included)).not.toBe(hashNetConfig(excluded))
    applyNetworkConfig(target, included)
    expect(target.reporting.recipient).toBe('http://network-monitor/api')
    expect(hashLocalNetworkConfig(target)).toBe(hashNetConfig(included))
  } finally {
    selectNetworkConfigField(copyConfig(), 'reporting.recipient', 'include')
  }
})
