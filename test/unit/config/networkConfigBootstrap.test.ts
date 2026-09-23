import SERVER_CONFIG from '../../../src/config/server'
import { buildNetworkConfig, getAppliedNetworkConfigMetadata, setAppliedNetworkConfigMetadata } from '../../../src/config/networkConfig'
import { adoptNetworkConfig } from '../../../src/config/networkConfigBootstrap'
import { StrictServerConfiguration } from '../../../src/shardus/shardus-types'

const HASH = 'a'.repeat(64)
const MARKER = 'b'.repeat(64)
const copyConfig = (): StrictServerConfiguration => JSON.parse(JSON.stringify(SERVER_CONFIG))
const cycle = { counter: 12, networkConfigHash: HASH } as any

describe('network configuration bootstrap', () => {
  beforeEach(() => setAppliedNetworkConfigMetadata(null))

  test('tries another active node after a malformed response and applies a verified payload', async () => {
    const target = copyConfig()
    const payload = buildNetworkConfig(target)
    payload.p2p.cycleDuration = 91
    const get = jest
      .fn()
      .mockResolvedValueOnce({ config: null })
      .mockResolvedValueOnce({ config: payload, networkConfigHash: HASH })
    const hash = jest.fn().mockReturnValue(HASH)

    const applied = await adoptNetworkConfig(
      target,
      [
        { ip: '127.0.0.1', port: 1001 },
        { ip: '127.0.0.2', port: 1002 },
      ],
      {
        queryCycleMarker: jest
          .fn()
          .mockResolvedValue({ marker: MARKER, winningNodes: [{ ip: '127.0.0.1', port: 1001 }] }),
        fetchCycleByMarker: jest.fn().mockResolvedValue(cycle),
        makeCycleMarker: () => MARKER,
        shuffle: (nodes) => nodes,
        get,
        hash,
        payloadHash: () => HASH,
      }
    )

    expect(get).toHaveBeenCalledTimes(2)
    expect(target.p2p.cycleDuration).toBe(91)
    expect(applied).toEqual({
      networkConfigHash: HASH,
      networkConfigCycleMarker: MARKER,
      cycleCounter: 12,
    })
    expect(getAppliedNetworkConfigMetadata()).toEqual(applied)
  })

  test('rejects response and cycle hash disagreement without applying it', async () => {
    const target = copyConfig()
    const originalDuration = target.p2p.cycleDuration
    const payload = buildNetworkConfig(target)
    payload.p2p.cycleDuration = 91

    await expect(
      adoptNetworkConfig(
        target,
        [{ ip: '127.0.0.1', port: 1001 }],
        {
          queryCycleMarker: jest
            .fn()
            .mockResolvedValue({ marker: MARKER, winningNodes: [{ ip: '127.0.0.1', port: 1001 }] }),
          fetchCycleByMarker: jest.fn().mockResolvedValue(cycle),
          makeCycleMarker: () => MARKER,
          get: jest.fn().mockResolvedValue({ config: payload, networkConfigHash: 'c'.repeat(64) }),
          hash: jest.fn().mockReturnValue(HASH),
          payloadHash: jest.fn().mockReturnValue(HASH),
        },
        1
      )
    ).rejects.toThrow('network configuration hash mismatch')
    expect(target.p2p.cycleDuration).toBe(originalDuration)
  })

  test('bounds overall retries', async () => {
    const queryCycleMarker = jest
      .fn()
      .mockResolvedValue({ marker: MARKER, winningNodes: [{ ip: '127.0.0.1', port: 1001 }] })
    const get = jest.fn().mockRejectedValue(new Error('unavailable'))

    await expect(
      adoptNetworkConfig(
        copyConfig(),
        [{ ip: '127.0.0.1', port: 1001 }],
        {
          queryCycleMarker,
          fetchCycleByMarker: jest.fn().mockResolvedValue(cycle),
          makeCycleMarker: () => MARKER,
          get,
          hash: () => HASH,
          payloadHash: () => HASH,
        },
        3
      )
    ).rejects.toThrow('after 3 attempts')
    expect(queryCycleMarker).toHaveBeenCalledTimes(3)
    expect(get).toHaveBeenCalledTimes(3)
  })

  test('rejects a fetched cycle whose marker does not match robust agreement', async () => {
    await expect(
      adoptNetworkConfig(
        copyConfig(),
        [{ ip: '127.0.0.1', port: 1001 }],
        {
          queryCycleMarker: jest
            .fn()
            .mockResolvedValue({ marker: MARKER, winningNodes: [{ ip: '127.0.0.1', port: 1001 }] }),
          fetchCycleByMarker: jest.fn().mockResolvedValue(cycle),
          makeCycleMarker: () => 'd'.repeat(64),
          get: jest.fn(),
        },
        1
      )
    ).rejects.toThrow('cycle marker mismatch')
  })
})
