import SERVER_CONFIG from '../../../src/config/server'
import { logFlags } from '../../../src/logger'
import {
  buildNetworkConfig,
  getAppliedNetworkConfigMetadata,
  setAppliedNetworkConfigMetadata,
} from '../../../src/config/networkConfig'
import { adoptNetworkConfig, waitForNetworkConfig } from '../../../src/config/networkConfigInitialization'
import { setTimeout as sleep } from 'timers/promises'

jest.mock('timers/promises', () => ({ setTimeout: jest.fn() }))

const HASH = 'a'.repeat(64)
const MARKER = 'b'.repeat(64)
const peer = { ip: '127.0.0.1', port: 1001 }
const copyConfig = () => JSON.parse(JSON.stringify(SERVER_CONFIG))
const dependencies = () => ({
  queryCycleMarker: jest.fn().mockResolvedValue({ marker: MARKER, winningNodes: [peer] }),
  fetchCycleByMarker: jest.fn().mockResolvedValue({ counter: 12, networkConfigHash: HASH }),
  makeCycleMarker: () => MARKER,
  payloadHash: () => HASH,
  hash: () => HASH,
})
const delayed = <T>() => {
  let resolve: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve: (value: T) => resolve(value) }
}

describe('network config readiness and cancellation', () => {
  let verbose: boolean
  beforeEach(() => {
    verbose = logFlags.verbose
    logFlags.verbose = false
    setAppliedNetworkConfigMetadata(null)
    ;(sleep as jest.Mock).mockResolvedValue(undefined)
  })
  afterEach(() => {
    logFlags.verbose = verbose
    jest.restoreAllMocks()
  })

  test('waits beyond three empty-marker rounds, refreshes peers, and applies only after readiness', async () => {
    const target = copyConfig()
    const payload = buildNetworkConfig(target)
    payload.p2p.cycleDuration = 91
    const deps = dependencies()
    let round = 0
    const discover = jest.fn(async () => [{ ...peer, port: 1000 + ++round }])
    deps.queryCycleMarker.mockImplementation(async (nodes) => ({
      marker: round > 4 ? MARKER : null,
      winningNodes: nodes,
    }))
    const get = jest.fn().mockResolvedValue({ config: payload, networkConfigHash: HASH })
    const controller = new AbortController()
    await waitForNetworkConfig(async () => {
      const nodes = await discover()
      return adoptNetworkConfig(target, nodes, { ...deps, get, signal: controller.signal }, 1)
    }, controller.signal)
    expect(discover).toHaveBeenCalledTimes(5)
    expect(sleep).toHaveBeenCalledTimes(4)
    for (const call of (sleep as jest.Mock).mock.calls) {
      expect(call).toEqual([5000, undefined, { signal: controller.signal }])
    }
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('127.0.0.1:1005/netconfig')
    expect(target.p2p.cycleDuration).toBe(91)
    expect(getAppliedNetworkConfigMetadata()?.networkConfigHash).toBe(HASH)
  })

  test('retries discovery errors and logs each distinct reason outside verbose mode', async () => {
    const important = logFlags.important_as_fatal
    logFlags.verbose = false
    logFlags.important_as_fatal = true
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const attempt = jest
        .fn()
        .mockRejectedValueOnce(new Error('empty signed list'))
        .mockRejectedValueOnce(new Error('empty signed list'))
        .mockRejectedValueOnce(new Error('signature rejected'))
        .mockResolvedValue('ready')
      await expect(waitForNetworkConfig(attempt, new AbortController().signal, 0)).resolves.toBe('ready')
      expect(attempt).toHaveBeenCalledTimes(4)
      // A repeated reason is not logged again within the same minute.
      expect(errors.mock.calls).toEqual([
        [
          '[config-enforced] network config initialization waiting',
          expect.objectContaining({ attempt: 1, retryDelayMs: 0, reason: 'empty signed list' }),
        ],
        [
          '[config-enforced] network config initialization waiting',
          expect.objectContaining({ attempt: 3, reason: 'signature rejected' }),
        ],
      ])
    } finally {
      errors.mockRestore()
      logFlags.important_as_fatal = important
    }
  })

  test('logs a repeated reason again once a minute has passed since the last log', async () => {
    const important = logFlags.important_as_fatal
    logFlags.important_as_fatal = true
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    // Rounds 1-4 fail with the same reason; the clock advances 30s per round.
    let clock = 1_000_000
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock)
    try {
      const attempt = jest.fn(async () => {
        clock += 30_000
        if (attempt.mock.calls.length <= 4) throw new Error('archiver unavailable')
        return 'ready'
      })
      await expect(waitForNetworkConfig(attempt, new AbortController().signal, 0)).resolves.toBe('ready')
      // Logged at round 1, skipped at round 2 (30s later), logged again at round 3 (60s), skipped at round 4.
      expect(errors.mock.calls.map(([, details]) => (details as { attempt: number }).attempt)).toEqual([1, 3])
    } finally {
      now.mockRestore()
      errors.mockRestore()
      logFlags.important_as_fatal = important
    }
  })

  test('logs all three hashes on mismatch only when verbose is enabled', async () => {
    const logs = jest.spyOn(console, 'log').mockImplementation(() => {})
    for (const verbose of [false, true]) {
      logFlags.verbose = verbose
      logs.mockClear()
      await expect(
        adoptNetworkConfig(
          copyConfig(),
          [peer],
          {
            ...dependencies(),
            get: async () => ({ config: buildNetworkConfig(copyConfig()), networkConfigHash: 'c'.repeat(64) }),
          },
          1
        )
      ).rejects.toThrow('network configuration hash mismatch')
      if (verbose) {
        expect(logs).toHaveBeenCalledWith('[config-enforced] config-hash-mismatch', {
          peer: '127.0.0.1:1001',
          verifiedCycleRecordNetConfigHash: HASH,
          netConfigResponseReportedHash: 'c'.repeat(64),
          downloadedNetConfigComputedHash: HASH,
        })
      } else expect(logs).not.toHaveBeenCalled()
    }
  })

  test('failed applied hash leaves the original config and metadata intact', async () => {
    const target = copyConfig()
    const before = JSON.stringify(target)
    const payload = buildNetworkConfig(target)
    payload.p2p.cycleDuration = 91
    await expect(
      adoptNetworkConfig(
        target,
        [peer],
        {
          ...dependencies(),
          get: async () => ({ config: payload, networkConfigHash: HASH }),
          hash: () => 'c'.repeat(64),
        },
        1
      )
    ).rejects.toThrow('applied network configuration hash mismatch')
    expect(JSON.stringify(target)).toBe(before)
    expect(getAppliedNetworkConfigMetadata()).toBeNull()
  })

  test.each(['marker', 'cycle', 'config'])(
    'cancels while fetching %s without applying or continuing',
    async (stage) => {
      const target = copyConfig()
      const before = JSON.stringify(target)
      const controller = new AbortController()
      const pending = delayed<any>()
      const reached = delayed<void>()
      const deps = dependencies()
      const payload = buildNetworkConfig(target)
      const get = jest.fn().mockResolvedValue({ config: payload, networkConfigHash: HASH })
      const blocked = jest.fn(() => {
        reached.resolve()
        return pending.promise
      })
      if (stage === 'marker') deps.queryCycleMarker = blocked
      if (stage === 'cycle') deps.fetchCycleByMarker = blocked
      const result = adoptNetworkConfig(
        target,
        [peer],
        {
          ...deps,
          get: stage === 'config' ? blocked : get,
          signal: controller.signal,
        },
        1
      )
      const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
      await reached.promise
      controller.abort()
      pending.resolve(
        stage === 'marker'
          ? { marker: MARKER, winningNodes: [peer] }
          : stage === 'cycle'
          ? { counter: 12, networkConfigHash: HASH }
          : { config: payload, networkConfigHash: HASH }
      )
      await rejected
      expect(JSON.stringify(target)).toBe(before)
      expect(getAppliedNetworkConfigMetadata()).toBeNull()
    }
  )

  test('an already aborted wait never invokes discovery', async () => {
    const controller = new AbortController()
    controller.abort()
    const attempt = jest.fn()
    await expect(waitForNetworkConfig(attempt, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(attempt).not.toHaveBeenCalled()
    expect(sleep).not.toHaveBeenCalled()
  })
})
