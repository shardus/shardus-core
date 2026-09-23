import { createServer, Server } from 'http'
import { AddressInfo } from 'net'
import * as cryptoUtils from '@shardus/lib-crypto-utils'
import SERVER_CONFIG from '../../../src/config/server'
import * as Context from '../../../src/p2p/Context'
import { logFlags } from '../../../src/logger'
import { initLogger } from '../../../src/p2p/SyncV2/queries'
import MemoryReporting from '../../../src/utils/memoryReporting'
import { shutdown } from '../../../src/p2p/CycleCreator'
import { buildNetworkConfig, hashLocalNetworkConfig, setAppliedNetworkConfigMetadata } from '../../../src/config/networkConfig'
import { adoptNetworkConfig, waitForNetworkConfig } from '../../../src/config/networkConfigBootstrap'
import { initCycleRecords } from '../../../src/types/ajv/CycleRecordSchema'

describe('bootstrap before P2P initialization with real HTTP helpers', () => {
  let server: Server
  let verbose: boolean
  let consoleFlag: boolean
  const hash = (value: any): string =>
    typeof value === 'string' ? cryptoUtils.hash(value) : cryptoUtils.hashObj(value, !!value.sign)

  beforeAll(() => {
    cryptoUtils.init(SERVER_CONFIG.crypto.hashKey)
    initCycleRecords()
  })
  beforeEach(() => {
    verbose = logFlags.verbose
    consoleFlag = logFlags.console
    logFlags.verbose = false
    logFlags.console = false
    Context.setConfig(JSON.parse(JSON.stringify(SERVER_CONFIG)))
    Context.setCryptoContext({ hash })
    Context.setLoggerContext({ getLogger: () => ({ info() {}, warn() {}, error() {} }) })
    initLogger() // Deliberately do not call Self.init() or CycleCreator.init().
    setAppliedNetworkConfigMetadata(null)
  })
  afterEach(async () => {
    logFlags.verbose = verbose
    logFlags.console = consoleFlag
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  test('queries, verifies, and applies through actual HTTP and cycle helpers', async () => {
    const target = JSON.parse(JSON.stringify(SERVER_CONFIG))
    target.p2p.netConfigV2 = true
    const accepted = JSON.parse(JSON.stringify(target))
    accepted.p2p.cycleDuration = 91
    accepted.p2p.rotationCountMultiply = 0.5
    accepted.p2p.extraCyclesToKeepMultiplier = 1.5
    const expectedHash = hashLocalNetworkConfig(accepted)
    const cycle: any = {
      networkId: 'f'.repeat(64),
      counter: 1,
      previous: '0'.repeat(64),
      start: 1,
      duration: 60,
      networkConfigHash: expectedHash,
      mode: 'forming',
      refreshedArchivers: [],
      refreshedConsensors: [],
      activated: [],
      activatedPublicKeys: [],
      active: 1,
      apoptosized: [],
      appRemoved: [],
      archiverListHash: '',
      expired: 0,
      joined: [],
      joinedArchivers: [],
      joinedConsensors: [],
      leavingArchivers: [],
      lost: [],
      lostArchivers: [],
      lostSyncing: [],
      maxSyncTime: 1200,
      nodeListHash: '',
      refuted: [],
      refutedArchivers: [],
      removed: [],
      removedArchivers: [],
      returned: [],
      standby: 0,
      standbyNodeListHash: '',
      syncing: 0,
      target: 10,
      desired: 10,
      random: 0,
      txadd: [],
      txremove: [],
      txlisthash: '',
    }
    const marker = hash(cycle)
    const requests: string[] = []
    server = createServer((req, res) => {
      requests.push(req.url)
      res.setHeader('Content-Type', 'application/json')
      if (req.url === '/current-cycle-hash') res.end(JSON.stringify({ currentCycleHash: marker }))
      else if (req.url === '/cycle-by-marker?marker=' + marker) res.end(JSON.stringify(cycle))
      else if (req.url === '/netconfig')
        res.end(
          JSON.stringify({
            config: buildNetworkConfig(accepted),
            networkConfigHash: expectedHash,
          })
        )
      else {
        res.statusCode = 404
        res.end('{}')
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const applied = await adoptNetworkConfig(target, [{ ip: '127.0.0.1', port }], { makeCycleMarker: hash }, 1)
    expect(applied.networkConfigHash).toBe(expectedHash)
    expect(target.p2p.cycleDuration).toBe(91)
    expect(target.p2p.rotationCountMultiply).toBe(0.5)
    expect(target.p2p.extraCyclesToKeepMultiplier).toBe(1.5)
    expect(hashLocalNetworkConfig(target)).toBe(expectedHash)
    expect(requests).toEqual(['/current-cycle-hash', '/cycle-by-marker?marker=' + marker, '/netconfig'])
  })

  test('real retry sleep is promptly cancelled without another round', async () => {
    const controller = new AbortController()
    let attempted: () => void
    const reached = new Promise<void>((resolve) => {
      attempted = resolve
    })
    const attempt = jest.fn(async () => {
      attempted()
      throw new Error('not ready')
    })
    const result = waitForNetworkConfig(attempt, controller.signal)
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await reached
    await new Promise<void>((resolve) => setImmediate(resolve))
    controller.abort()
    await rejected
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  test('exit reporting works before statistics initialization', () => {
    const reporting = new MemoryReporting({ statistics: null } as any)
    expect(() => reporting.gatherReport()).not.toThrow()
    expect(reporting.report).toEqual(expect.arrayContaining([expect.objectContaining({ subcat: 'Details' })]))
  })

  test('shutdown before initialization is safe and repeatable', () => {
    expect(() => shutdown()).not.toThrow()
    expect(() => shutdown()).not.toThrow()
  })
})
