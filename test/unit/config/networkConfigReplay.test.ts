import { readFileSync } from 'fs'
import path from 'path'
import vm from 'vm'
import ts from 'typescript'
import * as cryptoUtils from '@shardus/lib-crypto-utils'
import SERVER_CONFIG from '../../../src/config/server'
import { buildNetworkConfig, applyNetworkConfig, hasNonFiniteNumber } from '../../../src/config/networkConfig'

const source = ts.createSourceFile(
  'Shardus.ts',
  readFileSync(path.resolve(__dirname, '../../../src/shardus/index.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true
)
const shardus = source.statements.find(
  (node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'Shardus'
)

/** Build a stand-in Shardus from the real method source, with the module helpers those methods call. */
function loadShardusMethods(): any {
  const methods = ['updateConfigChangeQueue', 'patchObject', 'refreshStartupLogMode'].map((name) =>
    shardus.members
      .find((node): node is ts.MethodDeclaration => ts.isMethodDeclaration(node) && node.name.getText(source) === name)
      .getText(source)
  )
  const startupLogModeFn = source.statements
    .find(
      (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'startupLogMode'
    )
    .getText(source)
  const context = {
    crypto: cryptoUtils,
    hasNonFiniteNumber,
    // patchObject's counters are the only other module-global dependency these methods use.
    nestedCountersInstance: { countEvent: jest.fn() },
    result: null as any,
  }
  vm.createContext(context)
  vm.runInContext(
    ts.transpileModule(`${startupLogModeFn}\nresult = new class { ${methods.join('\n')} }`, {}).outputText,
    context
  )
  return context
}

/** Subsystem stubs refreshed by updateConfigChangeQueue. */
function stubSubsystems(config: any, startupLogMode: string): Record<string, any> {
  return {
    config,
    appliedConfigChanges: new Set(),
    crypto: { hash: cryptoUtils.hashObj },
    mainLogger: { info: jest.fn(), error: jest.fn() },
    p2p: { configUpdated: jest.fn() },
    network: { configUpdated: jest.fn() },
    loadDetection: { configUpdated: jest.fn() },
    rateLimiting: { configUpdated: jest.fn() },
    logger: { setStartupLogMode: jest.fn() },
    startupLogMode,
    app: { updateNetworkChangeQueue: jest.fn() },
  }
}

test('normal listOfChanges replay converges to the adopted snapshot', async () => {
  cryptoUtils.init(SERVER_CONFIG.crypto.hashKey)
  const context = loadShardusMethods()
  const target = JSON.parse(JSON.stringify(SERVER_CONFIG))
  const peer = JSON.parse(JSON.stringify(SERVER_CONFIG))
  peer.p2p.cycleDuration = 91
  applyNetworkConfig(target, buildNetworkConfig(peer))
  const stubs = stubSubsystems(target, 'fatal') // SERVER_CONFIG starts in fatal log mode
  Object.assign(context.result, stubs)
  const account = {
    data: {
      listOfChanges: [
        { cycle: 90, change: { p2p: { cycleDuration: 30 } } },
        { cycle: 100, change: { p2p: { cycleDuration: 91 } } },
        { cycle: 101, change: { p2p: { cycleDuration: 120 } } },
      ],
    },
  }
  await context.result.updateConfigChangeQueue(account, 100, false)
  expect(target.p2p.cycleDuration).toBe(91)
  expect(buildNetworkConfig(target)).toEqual(buildNetworkConfig(peer))
  // Settings NetworkClass copied at construction (e.g. network.timeout) are refreshed on config changes.
  expect(stubs.network.configUpdated).toHaveBeenCalledWith(target)
  await context.result.updateConfigChangeQueue(account, 101, false)
  expect(target.p2p.cycleDuration).toBe(120)
})

test('an approved config change re-applies the log mode only when the selected mode changes', async () => {
  cryptoUtils.init(SERVER_CONFIG.crypto.hashKey)
  const context = loadShardusMethods()
  const config = JSON.parse(JSON.stringify(SERVER_CONFIG))
  const stubs = stubSubsystems(config, 'fatal')
  Object.assign(context.result, stubs)
  const account = {
    data: {
      listOfChanges: [
        { cycle: 10, change: { debug: { startInFatalsLogMode: false, startInErrorLogMode: true } } },
        { cycle: 11, change: { p2p: { minNodes: 20 } } },
      ],
    },
  }
  await context.result.updateConfigChangeQueue(account, 10, false)
  expect(stubs.logger.setStartupLogMode).toHaveBeenCalledTimes(1)
  expect(stubs.logger.setStartupLogMode).toHaveBeenCalledWith('error')
  // An unrelated change keeps flags an operator may have set at runtime through the log-flag endpoints.
  await context.result.updateConfigChangeQueue(account, 11, false)
  expect(config.p2p.minNodes).toBe(20)
  expect(stubs.logger.setStartupLogMode).toHaveBeenCalledTimes(1)
})

test('a config change carrying a non-finite number skips that value and applies the rest', async () => {
  cryptoUtils.init(SERVER_CONFIG.crypto.hashKey)
  const context = loadShardusMethods()
  const config = JSON.parse(JSON.stringify(SERVER_CONFIG))
  Object.assign(context.result, stubSubsystems(config, 'fatal'))
  // A change_config body such as {"cycleDuration":1e309} parses to Infinity.
  const change = JSON.parse('{"p2p":{"cycleDuration":1e309,"minNodes":20},"debug":{"multisigKeys":{"k":1e309}}}')
  expect(change.p2p.cycleDuration).toBe(Infinity)
  const account = { data: { listOfChanges: [{ cycle: 10, change }] } }
  await context.result.updateConfigChangeQueue(account, 10, false)
  expect(config.p2p.cycleDuration).toBe(SERVER_CONFIG.p2p.cycleDuration)
  expect(config.p2p.minNodes).toBe(20)
  expect(config.debug.multisigKeys).toEqual(SERVER_CONFIG.debug.multisigKeys)
  expect(context.nestedCountersInstance.countEvent).toHaveBeenCalledWith(
    'config',
    'skipped non-finite change to cycleDuration'
  )
})

test('initialization filters self without mutating the signed handshake', () => {
  let peers: ts.Expression
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'adoptNetworkConfig') peers = node.arguments[1]
    ts.forEachChild(node, visit)
  }
  visit(source)
  const activeNodes = [
    { ip: 'self', port: 9001 },
    { ip: 'peer1', port: 9002 },
    { ip: 'peer2', port: 9003 },
  ]
  const context = { activeNodes, Network: { ipInfo: { externalIp: 'self', externalPort: 9001 } } }
  const result = vm.runInNewContext(peers.getText(source), context)
  expect(result).toEqual(activeNodes.slice(1))
  expect(activeNodes).toHaveLength(3)
})
