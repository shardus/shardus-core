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

interface Loaded {
  shardus: any
  hook: jest.Mock
  adoptNetworkConfig: jest.Mock
  complete: jest.Mock
  calls: string[]
}

function load(options: {
  netConfigV2: boolean
  hookEnables?: boolean
  hook?: boolean
  adoptFails?: boolean
  timeSynced?: boolean
}): Loaded {
  const config = { p2p: { netConfigV2: options.netConfigV2, timeServers: ['time'] } }
  const calls: string[] = []
  const adoptNetworkConfig = jest.fn(async () => {
    calls.push('adopt')
    if (options.adoptFails) throw new Error('Unable to adopt accepted network configuration')
    config.p2p.netConfigV2 = true // the verified payload carries the network's flag
  })
  const complete = jest.fn(() => calls.push('complete'))
  const context: Record<string, any> = {
    logFlags: {},
    refreshNetworkConfigSchema: jest.fn(() => calls.push('schema')),
    adoptNetworkConfig,
    completeNetworkConfigAdoption: complete,
    Network: {
      checkAndUpdateTimeSyncedOffset: jest.fn(async () => {
        calls.push('time')
        return options.timeSynced ?? true
      }),
    },
    result: null,
  }
  vm.createContext(context)
  vm.runInContext(code, context)
  const shardus = context.result
  const hook = jest.fn(async () => {
    calls.push('hook')
    if (options.hookEnables) config.p2p.netConfigV2 = true
  })
  const refresh = (): jest.Mock => jest.fn(() => calls.push('refresh'))
  Object.assign(shardus, {
    config,
    app: options.hook === false ? {} : { prepareNetworkConfigMigrations: hook },
    crypto: { hash: jest.fn() },
    networkConfigInitializationController: new AbortController(),
    p2p: { configUpdated: refresh() },
    network: { configUpdated: refresh() },
    refreshStartupLogMode: refresh(),
    loadDetection: { configUpdated: refresh() },
    rateLimiting: { configUpdated: refresh() },
  })
  return { shardus, hook, adoptNetworkConfig, complete, calls }
}

const peers = [{ ip: '127.0.0.1', port: 9001 }]
const refreshes = ['refresh', 'refresh', 'refresh', 'refresh', 'refresh']

test('runs the migrations, adopts, refreshes and checks time before completing', async () => {
  const { shardus, hook, adoptNetworkConfig, calls } = load({ netConfigV2: false, hookEnables: true })
  await shardus.adoptNetworkConfigWhileJoining(peers)
  expect(hook).toHaveBeenCalledWith(false)
  expect(adoptNetworkConfig).toHaveBeenCalledWith(shardus.config, peers, expect.anything(), 1)
  expect(calls).toEqual(['hook', 'schema', 'adopt', ...refreshes, 'time', 'complete'])
})

test('adopts even when the hook leaves netConfigV2 off', async () => {
  const { shardus, adoptNetworkConfig, complete } = load({ netConfigV2: false, hookEnables: false })
  await shardus.adoptNetworkConfigWhileJoining(peers)
  expect(adoptNetworkConfig).toHaveBeenCalledTimes(1)
  expect(shardus.config.p2p.netConfigV2).toBe(true)
  expect(complete).toHaveBeenCalledTimes(1)
})

test('adopts for a dapp without the migration hook', async () => {
  const { shardus, adoptNetworkConfig, complete } = load({ netConfigV2: false, hook: false })
  await shardus.adoptNetworkConfigWhileJoining(peers)
  expect(adoptNetworkConfig).toHaveBeenCalledTimes(1)
  expect(complete).toHaveBeenCalledTimes(1)
})

test('reruns the hook on a retry after netConfigV2 is already on', async () => {
  const { shardus, hook, adoptNetworkConfig } = load({ netConfigV2: true })
  await shardus.adoptNetworkConfigWhileJoining(peers)
  expect(hook).toHaveBeenCalledTimes(1)
  expect(adoptNetworkConfig).toHaveBeenCalledTimes(1)
})

test('stays pending when adoption fails', async () => {
  const { shardus, complete } = load({ netConfigV2: false, hookEnables: true, adoptFails: true })
  await expect(shardus.adoptNetworkConfigWhileJoining(peers)).rejects.toThrow('Unable to adopt')
  expect(complete).not.toHaveBeenCalled()
})

test('stays pending when the time is not in sync with the adopted time servers', async () => {
  const { shardus, complete } = load({ netConfigV2: false, hookEnables: true, timeSynced: false })
  await expect(shardus.adoptNetworkConfigWhileJoining(peers)).rejects.toThrow('Time is not in sync')
  expect(complete).not.toHaveBeenCalled()
})
