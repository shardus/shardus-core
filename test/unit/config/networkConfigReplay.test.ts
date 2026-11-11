import { readFileSync } from 'fs'
import path from 'path'
import vm from 'vm'
import ts from 'typescript'
import * as cryptoUtils from '@shardus/lib-crypto-utils'
import SERVER_CONFIG from '../../../src/config/server'
import { buildNetworkConfig, applyNetworkConfig, hashLocalNetworkConfig } from '../../../src/config/networkConfig'
import * as Context from '../../../src/p2p/Context'
import { StrictServerConfiguration } from '../../../src/shardus/shardus-types'

const source = ts.createSourceFile(
  'Shardus.ts',
  readFileSync(path.resolve(__dirname, '../../../src/shardus/index.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true
)
const shardus = source.statements.find(
  (node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'Shardus'
)

function createConfigChangeQueue(config: StrictServerConfiguration) {
  const methods = ['updateConfigChangeQueue', 'patchObject'].map((name) =>
    shardus.members
      .find((node): node is ts.MethodDeclaration => ts.isMethodDeclaration(node) && node.name.getText(source) === name)
      .getText(source)
  )
  const context = { result: null as any, nestedCountersInstance: { countEvent: jest.fn() } }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(`result = new class { ${methods.join('\n')} }`, {}).outputText, context)
  Object.assign(context.result, {
    config,
    appliedConfigChanges: new Set(),
    crypto: { hash: cryptoUtils.hashObj },
    mainLogger: { info: jest.fn() },
    p2p: { configUpdated: jest.fn() },
    loadDetection: { configUpdated: jest.fn() },
    rateLimiting: { configUpdated: jest.fn() },
    app: { updateNetworkChangeQueue: jest.fn() },
  })
  return context.result
}

test('normal listOfChanges replay converges to the adopted snapshot', async () => {
  cryptoUtils.init(SERVER_CONFIG.crypto.hashKey)
  const target = JSON.parse(JSON.stringify(SERVER_CONFIG))
  const peer = JSON.parse(JSON.stringify(SERVER_CONFIG))
  peer.p2p.cycleDuration = 91
  peer.p2p.netConfigV2 = true
  peer.p2p.networkConfigHashEnforcement = false
  applyNetworkConfig(target, buildNetworkConfig(peer))
  const queue = createConfigChangeQueue(target)
  const account = {
    data: {
      listOfChanges: [
        { cycle: 90, change: { p2p: { cycleDuration: 30, netConfigV2: false } } },
        { cycle: 100, change: { p2p: { cycleDuration: 91, netConfigV2: true } } },
        { cycle: 101, change: { p2p: { cycleDuration: 120, networkConfigHashEnforcement: true } } },
      ],
    },
  }
  await queue.updateConfigChangeQueue(account, 100, false)
  expect(target.p2p.cycleDuration).toBe(91)
  expect(target.p2p.netConfigV2).toBe(true)
  expect(target.p2p.networkConfigHashEnforcement).toBe(false)
  expect(buildNetworkConfig(target)).toEqual(buildNetworkConfig(peer))
  await queue.updateConfigChangeQueue(account, 101, false)
  expect(target.p2p.cycleDuration).toBe(120)
  expect(target.p2p.networkConfigHashEnforcement).toBe(true)
})

test('activates V2 and enforcement only at their scheduled cycles and skips already applied changes', async () => {
  cryptoUtils.init(SERVER_CONFIG.crypto.hashKey)
  ;(Context as any).crypto = { hash: cryptoUtils.hashObj }
  const config = JSON.parse(JSON.stringify(SERVER_CONFIG))
  config.p2p.netConfigV2 = false
  config.p2p.networkConfigHashEnforcement = false
  const queue = createConfigChangeQueue(config)
  const account = {
    data: {
      listOfChanges: [
        { cycle: 100, change: { p2p: { netConfigV2: true } } },
        { cycle: 101, change: { p2p: { networkConfigHashEnforcement: true } } },
      ],
    },
  }
  const legacyHash = hashLocalNetworkConfig(config)
  await queue.updateConfigChangeQueue(account, 99, false)
  expect(config.p2p.netConfigV2).toBe(false)
  expect(config.p2p.networkConfigHashEnforcement).toBe(false)
  expect(hashLocalNetworkConfig(config)).toBe(legacyHash)
  expect(queue.p2p.configUpdated).not.toHaveBeenCalled()

  await queue.updateConfigChangeQueue(account, 100, false)
  expect(config.p2p.netConfigV2).toBe(true)
  expect(config.p2p.networkConfigHashEnforcement).toBe(false)
  const v2Hash = hashLocalNetworkConfig(config)
  expect(v2Hash).toBe(cryptoUtils.hashObj(buildNetworkConfig(config)))
  expect(v2Hash).not.toBe(legacyHash)

  await queue.updateConfigChangeQueue(account, 100, false)
  expect(hashLocalNetworkConfig(config)).toBe(v2Hash)
  expect(queue.p2p.configUpdated).toHaveBeenCalledTimes(1)

  await queue.updateConfigChangeQueue(account, 101, false)
  expect(config.p2p.networkConfigHashEnforcement).toBe(true)
  expect(hashLocalNetworkConfig(config)).not.toBe(v2Hash)
  expect(queue.p2p.configUpdated).toHaveBeenCalledTimes(2)
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
