import { readFileSync } from 'fs'
import path from 'path'
import vm from 'vm'
import ts from 'typescript'

// Runs the real Shardus.adoptNetworkConfigWhileJoining source against stubbed module helpers.
const source = ts.createSourceFile(
  'Shardus.ts',
  readFileSync(path.resolve(__dirname, '../../../src/shardus/index.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true
)
const shardusClass = source.statements.find(
  (node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'Shardus'
)
const method = shardusClass.members
  .find(
    (node): node is ts.MethodDeclaration =>
      ts.isMethodDeclaration(node) && node.name.getText(source) === 'adoptNetworkConfigWhileJoining'
  )
  .getText(source)
const code = ts.transpileModule(`result = new class { ${method} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText

function load(options: { netConfigV2: boolean; hookEnables?: boolean; timeSynced?: boolean }) {
  const config = { p2p: { netConfigV2: options.netConfigV2, timeServers: ['time'] } }
  const calls: string[] = []
  const adoptNetworkConfig = jest.fn(async () => {
    calls.push('adopt')
  })
  const context: Record<string, any> = {
    logFlags: {},
    refreshNetworkConfigSchema: jest.fn(() => calls.push('schema')),
    adoptNetworkConfig,
    Network: { checkAndUpdateTimeSyncedOffset: jest.fn(async () => options.timeSynced ?? true) },
    result: null,
  }
  vm.createContext(context)
  vm.runInContext(code, context)
  const shardus = context.result
  const hook = jest.fn(async () => {
    calls.push('hook')
    if (options.hookEnables) config.p2p.netConfigV2 = true
  })
  const refresh = () => jest.fn(() => calls.push('refresh'))
  Object.assign(shardus, {
    config,
    app: { prepareNetworkConfigMigrations: hook },
    crypto: { hash: jest.fn() },
    networkConfigInitializationController: new AbortController(),
    p2p: { configUpdated: refresh() },
    network: { configUpdated: refresh() },
    refreshStartupLogMode: refresh(),
    loadDetection: { configUpdated: refresh() },
    rateLimiting: { configUpdated: refresh() },
  })
  return { shardus, hook, adoptNetworkConfig, calls, context }
}

const peers = [{ ip: '127.0.0.1', port: 9001 }]

test('runs the migrations, adopts the network config, then refreshes the subsystems', async () => {
  const { shardus, hook, adoptNetworkConfig, calls } = load({ netConfigV2: false, hookEnables: true })
  await shardus.adoptNetworkConfigWhileJoining(peers)
  expect(hook).toHaveBeenCalledWith(false)
  expect(adoptNetworkConfig).toHaveBeenCalledWith(shardus.config, peers, expect.anything(), 1)
  expect(calls).toEqual(['hook', 'schema', 'adopt', 'refresh', 'refresh', 'refresh', 'refresh', 'refresh'])
})

test('waits when the network active version has not enabled netConfigV2 yet', async () => {
  const { shardus, hook, adoptNetworkConfig } = load({ netConfigV2: false, hookEnables: false })
  await shardus.adoptNetworkConfigWhileJoining(peers)
  expect(hook).toHaveBeenCalledTimes(1)
  expect(adoptNetworkConfig).not.toHaveBeenCalled()
})

test('retries adoption without rerunning the migrations once netConfigV2 is on', async () => {
  const { shardus, hook, adoptNetworkConfig } = load({ netConfigV2: true })
  await shardus.adoptNetworkConfigWhileJoining(peers)
  expect(hook).not.toHaveBeenCalled()
  expect(adoptNetworkConfig).toHaveBeenCalledTimes(1)
})

test('rejects the adopted config when the time is not in sync with its time servers', async () => {
  const { shardus } = load({ netConfigV2: false, hookEnables: true, timeSynced: false })
  await expect(shardus.adoptNetworkConfigWhileJoining(peers)).rejects.toThrow('Time is not in sync')
})
