import { readFileSync } from 'fs'
import path from 'path'
import vm from 'vm'
import ts from 'typescript'
import SERVER_CONFIG from '../../../src/config/server'

/**
 * Runs the real Shardus.start() source up to network.setup() with controlled dependencies, to check the
 * order of the network-config initialization steps on the genesis and join paths. No sockets are opened.
 */
const source = ts.createSourceFile(
  'Shardus.ts',
  readFileSync(path.resolve(__dirname, '../../../src/shardus/index.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true
)
const shardus = source.statements.find(
  (node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'Shardus'
)
const methodSource = (name: string): string =>
  shardus.members
    .find((node): node is ts.MethodDeclaration => ts.isMethodDeclaration(node) && node.name.getText(source) === name)
    .getText(source)
const startupLogModeSource = source.statements
  .find(
    (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'startupLogMode'
  )
  .getText(source)

const STOP = new Error('stop before sockets')
const SELF = { ip: '127.0.0.1', port: 9001 }
const PEER = { ip: '127.0.0.2', port: 9002 }

async function runStartUntilSetup(nodeList: Array<{ ip: string; port: number }>, migrate: (config: any) => void) {
  const steps: string[] = []
  const config = JSON.parse(JSON.stringify(SERVER_CONFIG))
  config.p2p.netConfigV2 = true
  config.p2p.existingArchivers = [{ ip: '127.0.0.9', port: 4000, publicKey: 'archiver' }]
  const adoptNetworkConfig = jest.fn(async (target: any, peers: unknown[]) => {
    steps.push('adopt')
    // The adopted network config selects a different startup log mode than the local file.
    target.debug.startInFatalsLogMode = false
    target.debug.startInErrorLogMode = true
    return peers
  })
  const checkAndUpdateTimeSyncedOffset = jest.fn(async () => true)
  const context: any = {
    Network: {
      init: async () => undefined,
      checkAndUpdateTimeSyncedOffset,
      ipInfo: { externalIp: SELF.ip, externalPort: SELF.port },
    },
    isServiceMode: () => false,
    logFlags: { verbose: false },
    initInitializationQueryLogger: () => undefined,
    waitForNetworkConfig: async (attempt: () => Promise<unknown>) => attempt(),
    getActiveNodesFromArchiver: async () => ({ isErr: () => false, value: { nodeList } }),
    refreshNetworkConfigSchema: jest.fn(() => steps.push('schema')),
    hashLocalNetworkConfig: () => 'hash',
    setAppliedNetworkConfigMetadata: jest.fn(),
    adoptNetworkConfig,
    result: null,
  }
  vm.createContext(context)
  vm.runInContext(
    ts.transpileModule(
      `${startupLogModeSource}\nresult = new class { ${methodSource('start')}\n${methodSource(
        'refreshStartupLogMode'
      )} }`,
      {}
    ).outputText,
    context
  )
  const network = {
    configUpdated: jest.fn(() => steps.push('network')),
    setup: async () => {
      throw STOP
    },
    on: () => {
      throw STOP
    },
  }
  const logger = { setStartupLogMode: jest.fn((mode: string) => steps.push(`log:${mode}`)) }
  Object.assign(context.result, {
    config,
    storage: { init: async () => undefined },
    crypto: { init: async () => undefined, verify: () => true, hash: () => 'marker', keypair: { secretKey: 'sk' } },
    networkConfigInitializationController: new AbortController(),
    app: {
      prepareNetworkConfigMigrations: jest.fn(async () => {
        steps.push('hook')
        migrate(config)
      }),
    },
    network,
    logger,
    mainLogger: { error: jest.fn(), info: jest.fn() },
    startupLogMode: 'fatal', // SERVER_CONFIG starts in fatal log mode
  })
  await expect(context.result.start()).rejects.toBe(STOP)
  return { steps, config, context, network, adoptNetworkConfig, checkAndUpdateTimeSyncedOffset }
}

test('join path: migrate, refresh schema, adopt, then refresh copied values and the log mode', async () => {
  const run = await runStartUntilSetup([SELF, PEER], () => undefined)
  expect(run.steps).toEqual(['hook', 'schema', 'adopt', 'network', 'log:error'])
  expect(run.context.result.app.prepareNetworkConfigMigrations).toHaveBeenCalledWith(false)
  expect(run.context.refreshNetworkConfigSchema).toHaveBeenCalledWith(run.config)
  // Adoption never asks this node itself.
  expect(run.adoptNetworkConfig.mock.calls[0][1]).toEqual([PEER])
  expect(run.network.configUpdated).toHaveBeenCalledWith(run.config)
  // Time is checked at startup and again with the adopted time servers.
  expect(run.checkAndUpdateTimeSyncedOffset).toHaveBeenCalledTimes(2)
})

test('genesis path: migrations can change copied values, so they are refreshed without adoption', async () => {
  const run = await runStartUntilSetup([SELF], (config) => {
    config.debug.startInFatalsLogMode = false
    config.debug.startInErrorLogMode = false
  })
  expect(run.steps).toEqual(['hook', 'schema', 'network', 'log:'])
  expect(run.context.result.app.prepareNetworkConfigMigrations).toHaveBeenCalledWith(true)
  expect(run.adoptNetworkConfig).not.toHaveBeenCalled()
  expect(run.context.setAppliedNetworkConfigMetadata).toHaveBeenCalledWith(
    expect.objectContaining({ networkConfigCycleMarker: '0'.repeat(64), cycleCounter: 0 })
  )
  expect(run.checkAndUpdateTimeSyncedOffset).toHaveBeenCalledTimes(1)
})

test('an unchanged log mode is left alone', async () => {
  const run = await runStartUntilSetup([SELF], () => undefined)
  expect(run.steps).toEqual(['hook', 'schema', 'network'])
})
