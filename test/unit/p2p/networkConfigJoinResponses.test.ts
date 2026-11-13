import { readFileSync } from 'fs'
import path from 'path'
import vm from 'vm'
import ts from 'typescript'
import {
  evaluateNetworkConfigJoin,
  DEFAULT_MAX_NETWORK_CONFIG_REFERENCE_AGE,
  hasNetworkConfigMismatchMajority,
  hasNetworkConfigResponseMajority,
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

interface Sender {
  info: jest.Mock
  adoptionRequested: () => boolean
  run: () => Promise<void>
}

function sender(responses: unknown[], netConfigV2 = true, applied: unknown = null): Sender {
  const info = jest.fn()
  const post = jest.fn()
  for (const response of responses) {
    if (response instanceof Error) post.mockRejectedValueOnce(response)
    else post.mockResolvedValueOnce(response)
  }
  const context = {
    config: { p2p: { netConfigV2 } },
    logFlags: { important_as_fatal: true },
    info,
    error: jest.fn(),
    utils: { getRandom: (nodes: unknown[]) => nodes, formatErrorMessage: String },
    Utils: { safeStringify: JSON.stringify },
    nestedCountersInstance: { countEvent: jest.fn() },
    allowBogon: false,
    http: { post },
    hasNetworkConfigMismatchMajority,
    hasNetworkConfigResponseMajority,
    getAppliedNetworkConfigMetadata: () => applied,
    requestNetworkConfigAdoption: jest.fn(),
  }
  vm.createContext(context)
  vm.runInContext(code, context)
  const nodes = responses.map((_, index) => ({ ip: '127.0.0.1', port: 9000 + index }))
  return {
    info,
    adoptionRequested: () => context.requestNetworkConfigAdoption.mock.calls.length > 0,
    run: () => (context as any).submitJoinV2(nodes, { nodeInfo: { externalIp: '127.0.0.1' } }),
  }
}

test('logs missing and retryable join responses without crashing', async () => {
  const { info, run } = sender([null, { success: false, fatal: false, reason: 'Retry later' }])
  await expect(run()).resolves.toBeUndefined()
  expect(info).toHaveBeenCalledWith(expect.stringContaining('No join response received, Retry later'))
})

test('retries when every join response is missing', async () => {
  const { run } = sender([null, null])
  await expect(run()).rejects.toThrow('submitJoin: No validators responded; retry joining')
})

test.each([false, true])('only v2 stops on majority config mismatches (netConfigV2=%s)', async (enabled) => {
  const response = { success: false, fatal: false, code: 'NETWORK_CONFIG_HASH_MISMATCH' }
  const { run } = sender([response, response, response], enabled)
  if (enabled) await expect(run()).rejects.toThrow('Network configuration conformance failed')
  else await expect(run()).resolves.toBeUndefined()
})

test('a majority requiring network config fields requests adoption without failing the attempt', async () => {
  const required = { success: false, fatal: false, code: 'NETWORK_CONFIG_FIELDS_REQUIRED' }
  const { run, adoptionRequested } = sender([required, required, null], false)
  await expect(run()).resolves.toBeUndefined()
  expect(adoptionRequested()).toBe(true)
})

test('fatal bodies in HTTP error responses do not stop joining, as on dev', async () => {
  const httpError = (body: unknown): Error => Object.assign(new Error('Response code 500'), { response: { body } })
  const fatal = { success: false, fatal: true, reason: 'An error occurred while processing the join request' }
  const { run } = sender([httpError(fatal), httpError(JSON.stringify(fatal)), httpError(fatal)], false)
  await expect(run()).resolves.toBeUndefined()
})

test('network config codes in HTTP error responses still request adoption', async () => {
  const required = { success: false, fatal: false, code: 'NETWORK_CONFIG_FIELDS_REQUIRED' }
  const httpError = Object.assign(new Error('Response code 400'), { response: { body: required } })
  const { run, adoptionRequested } = sender([httpError, httpError, null], false)
  await expect(run()).resolves.toBeUndefined()
  expect(adoptionRequested()).toBe(true)
})

test('a majority of hash mismatches in HTTP error responses still stops a V2 joiner', async () => {
  const mismatch = { success: false, fatal: false, code: 'NETWORK_CONFIG_HASH_MISMATCH' }
  const httpError = (): Error => Object.assign(new Error('Response code 400'), { response: { body: mismatch } })
  const { run } = sender([httpError(), httpError(), httpError()], true)
  await expect(run()).rejects.toThrow('Fatal: Network configuration conformance failed')
})

test('a minority requiring network config fields does not request adoption', async () => {
  const required = { success: false, fatal: false, code: 'NETWORK_CONFIG_FIELDS_REQUIRED' }
  const { run, adoptionRequested } = sender([required, null, null], false)
  await run().catch(() => undefined)
  expect(adoptionRequested()).toBe(false)
})

test('a node that already adopted the network config does not request adoption again', async () => {
  const required = { success: false, fatal: false, code: 'NETWORK_CONFIG_FIELDS_REQUIRED' }
  const applied = { networkConfigHash: 'a'.repeat(64), networkConfigCycleMarker: 'b'.repeat(64), cycleCounter: 1 }
  const { run, adoptionRequested } = sender([required, required], true, applied)
  await expect(run()).resolves.toBeUndefined()
  expect(adoptionRequested()).toBe(false)
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

test.each([false, true])('transport errors remain retryable with V2=%s', async (enabled) => {
  await expect(sender([new Error('timeout'), new Error('timeout')], enabled).run()).rejects.not.toThrow('Fatal:')
})
test('explicit fatal validator responses remain fatal', async () => {
  await expect(sender([{ fatal: true, reason: 'invalid request' }]).run()).rejects.toThrow('Fatal:')
})
