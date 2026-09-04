import {
  evaluateNetworkConfigJoin,
  hasNetworkConfigMismatchMajority,
  NetworkConfigMismatchTracker,
} from '../../../src/p2p/Join/networkConfig'

const HASH = 'a'.repeat(64)
const OTHER_HASH = 'b'.repeat(64)
const MARKER = 'c'.repeat(64)

describe('network configuration join enforcement', () => {
  test('keeps missing fields compatible in report-only mode', () => {
    const result = evaluateNetworkConfigJoin({}, false, {})
    expect(result.diagnostic).toBe('NETWORK_CONFIG_FIELDS_REQUIRED')
    expect(result.response).toBeNull()
  })

  test('rejects missing fields non-fatally when enforcement is enabled', () => {
    expect(evaluateNetworkConfigJoin({}, true, {}).response).toMatchObject({
      success: false,
      fatal: false,
      code: 'NETWORK_CONFIG_FIELDS_REQUIRED',
    })
  })

  test('rejects unavailable markers and mismatches with structured diagnostics', () => {
    expect(
      evaluateNetworkConfigJoin({ networkConfigHash: HASH, networkConfigCycleMarker: MARKER }, true, {}).response
    ).toMatchObject({ code: 'NETWORK_CONFIG_CYCLE_UNAVAILABLE', fatal: false })

    expect(
      evaluateNetworkConfigJoin({ networkConfigHash: OTHER_HASH, networkConfigCycleMarker: MARKER }, true, {
        [MARKER]: { networkConfigHash: HASH },
      }).response
    ).toMatchObject({
      code: 'NETWORK_CONFIG_HASH_MISMATCH',
      expectedNetworkConfigHash: HASH,
      fatal: false,
    })
  })

  test('accepts a hash matching the referenced accepted cycle', () => {
    expect(
      evaluateNetworkConfigJoin({ networkConfigHash: HASH, networkConfigCycleMarker: MARKER }, true, {
        [MARKER]: { networkConfigHash: HASH },
      })
    ).toEqual({ diagnostic: null, response: null })
  })

  test('requires a strict majority and bounds repeated mismatches per hash', () => {
    const mismatch = { code: 'NETWORK_CONFIG_HASH_MISMATCH' }
    expect(hasNetworkConfigMismatchMajority(5, [mismatch, mismatch])).toBe(false)
    expect(hasNetworkConfigMismatchMajority(5, [mismatch, mismatch, mismatch])).toBe(true)

    const tracker = new NetworkConfigMismatchTracker()
    expect(tracker.record(HASH)).toBe(1)
    expect(tracker.record(HASH)).toBe(2)
    expect(tracker.record(HASH)).toBe(3)
    expect(tracker.record(OTHER_HASH)).toBe(1)
    tracker.reset()
    expect(tracker.record(OTHER_HASH)).toBe(1)
  })
})
