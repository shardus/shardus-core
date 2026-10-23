import { readFileSync } from 'fs'
import path from 'path'
import vm from 'vm'
import ts from 'typescript'
import {
  evaluateNetworkConfigJoin,
  DEFAULT_MAX_NETWORK_CONFIG_REFERENCE_AGE,
  hasNetworkConfigMismatchMajority,
} from '../../../src/p2p/Join/networkConfig'

// Exercise the real sender without loading the node's networking stack.
const source = ts.createSourceFile(
  'Join.ts',
  readFileSync(path.resolve(__dirname, '../../../src/p2p/Join/index.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true
)
const handler = source.statements.find(
  (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'submitJoinV2'
)
const code = ts.transpileModule(handler.getText(source).replace('export ', ''), {}).outputText

function sender(responses: unknown[], netConfigV2 = true) {
  const info = jest.fn()
  const post = jest.fn()
  for (const response of responses) post.mockResolvedValueOnce(response)
  const context = {
    config: { p2p: { netConfigV2 } },
    logFlags: { important_as_fatal: true },
    info,
    utils: { getRandom: (nodes: unknown[]) => nodes },
    Utils: { safeStringify: JSON.stringify },
    nestedCountersInstance: { countEvent: jest.fn() },
    allowBogon: false,
    http: { post },
    hasNetworkConfigMismatchMajority,
  }
  vm.createContext(context)
  vm.runInContext(code, context)
  const nodes = responses.map((_, index) => ({ ip: '127.0.0.1', port: 9000 + index }))
  return { info, run: () => (context as any).submitJoinV2(nodes, { nodeInfo: { externalIp: '127.0.0.1' } }) }
}

test('logs missing and retryable join responses without crashing', async () => {
  const { info, run } = sender([null, { success: false, fatal: false, reason: 'Retry later' }])
  await expect(run()).resolves.toBeUndefined()
  expect(info).toHaveBeenCalledWith(expect.stringContaining('No join response received, Retry later'))
})

test('reports a useful error when every join response is missing', async () => {
  const { run } = sender([null, null])
  await expect(run()).rejects.toThrow('All join requests failed: No join response received, No join response received')
})

test.each([false, true])('only v2 stops on majority config mismatches (netConfigV2=%s)', async (enabled) => {
  const response = { success: false, fatal: false, code: 'NETWORK_CONFIG_HASH_MISMATCH' }
  const { run } = sender([response, response, response], enabled)
  if (enabled) await expect(run()).rejects.toThrow('Network configuration conformance failed')
  else await expect(run()).resolves.toBeUndefined()
})

const validator = source.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'validateNetworkConfigHash'
)
const validatorCode = ts.transpileModule(validator.getText(source).replace('export ', ''), {}).outputText

test.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])('gates join validation with v2=%s and enforcement=%s', (netConfigV2, enforcement) => {
  const evaluate = jest.fn(evaluateNetworkConfigJoin)
  const countEvent = jest.fn()
  const context = {
    config: { p2p: { netConfigV2, networkConfigHashEnforcement: enforcement } },
    evaluateNetworkConfigJoin: evaluate,
    CycleChain: { cyclesByMarker: {}, newest: { counter: 10 } },
    DEFAULT_MAX_NETWORK_CONFIG_REFERENCE_AGE,
    nestedCountersInstance: { countEvent },
    logFlags: {},
  }
  vm.createContext(context)
  vm.runInContext(validatorCode, context)
  const response = (context as any).validateNetworkConfigHash({ nodeInfo: {} })
  if (!netConfigV2) {
    expect(response).toBeNull()
    expect(evaluate).not.toHaveBeenCalled()
    expect(countEvent).not.toHaveBeenCalled()
  } else {
    expect(evaluate).toHaveBeenCalledTimes(1)
    if (enforcement) expect(response).toMatchObject({ code: 'NETWORK_CONFIG_FIELDS_REQUIRED', fatal: false })
    else expect(response).toBeNull()
    expect(countEvent).toHaveBeenCalledTimes(1)
  }
})
