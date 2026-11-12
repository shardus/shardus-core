import { readFileSync } from 'fs'
import path from 'path'
import vm from 'vm'
import ts from 'typescript'
import * as cryptoUtils from '@shardus/lib-crypto-utils'
import SERVER_CONFIG from '../../../src/config/server'
import { buildNetworkConfig, applyNetworkConfig } from '../../../src/config/networkConfig'

const source = ts.createSourceFile(
  'Shardus.ts',
  readFileSync(path.resolve(__dirname, '../../../src/shardus/index.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true
)
const shardus = source.statements.find(
  (node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'Shardus'
)

test('normal listOfChanges replay converges to the adopted snapshot', async () => {
  cryptoUtils.init(SERVER_CONFIG.crypto.hashKey)
  const methods = ['updateConfigChangeQueue', 'patchObject'].map((name) =>
    shardus.members
      .find((node): node is ts.MethodDeclaration => ts.isMethodDeclaration(node) && node.name.getText(source) === name)
      .getText(source)
  )
  const context = { crypto: cryptoUtils, result: null as any }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(`result = new class { ${methods.join('\n')} }`, {}).outputText, context)
  const target = JSON.parse(JSON.stringify(SERVER_CONFIG))
  const peer = JSON.parse(JSON.stringify(SERVER_CONFIG))
  peer.p2p.cycleDuration = 91
  applyNetworkConfig(target, buildNetworkConfig(peer))
  const updated = jest.fn()
  const networkUpdated = jest.fn()
  Object.assign(context.result, {
    config: target,
    appliedConfigChanges: new Set(),
    crypto: { hash: cryptoUtils.hashObj },
    mainLogger: { info: jest.fn() },
    p2p: { configUpdated: updated },
    network: { configUpdated: networkUpdated },
    loadDetection: { configUpdated: updated },
    rateLimiting: { configUpdated: updated },
    app: { updateNetworkChangeQueue: jest.fn() },
  })
  // patchObject's logging is the only module-global dependency used by this replay.
  ;(context as any).nestedCountersInstance = { countEvent: jest.fn() }
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
  expect(networkUpdated).toHaveBeenCalledWith(target)
  await context.result.updateConfigChangeQueue(account, 101, false)
  expect(target.p2p.cycleDuration).toBe(120)
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
