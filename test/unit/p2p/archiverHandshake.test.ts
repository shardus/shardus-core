import { readFileSync } from 'fs'
import path from 'path'
import vm from 'vm'
import ts from 'typescript'

test('startup consumes the saved handshake once, including when the first attempt fails', async () => {
  const source = ts.createSourceFile(
    'Self.ts',
    readFileSync(path.resolve(__dirname, '../../../src/p2p/Self.ts'), 'utf8'),
    ts.ScriptTarget.Latest,
    true
  )
  const handler = source.statements.find(
    (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'startupV2'
  )
  const code = ts.transpileModule(handler.getText(source).replace('export ', ''), {}).outputText
  const scheduled: Array<() => void> = []
  const contactArchiver = jest.fn().mockRejectedValue(new Error('Try again'))
  const context = {
    isServiceMode: () => false,
    Context: { crypto: { getPublicKey: () => 'node' }, config: { p2p: { cycleDuration: 30 } } },
    info: jest.fn(),
    logFlags: {},
    emitter: { emit: jest.fn() },
    contactArchiver,
    setTimeout: (callback: () => void) => scheduled.push(callback),
    clearTimeout: jest.fn(),
    utils: { formatErrorMessage: String },
  }
  vm.createContext(context)
  vm.runInContext(code, context)
  const handshake = { archiver: {}, response: {} }
  void (context as any).startupV2({}, handshake)
  for (let i = 0; i < 10; i++) await Promise.resolve()
  expect(contactArchiver).toHaveBeenNthCalledWith(1, 'startupV2:attemptJoining', handshake)
  expect(scheduled).toHaveLength(1)
  scheduled.shift()()
  for (let i = 0; i < 10; i++) await Promise.resolve()
  expect(contactArchiver).toHaveBeenNthCalledWith(2, 'startupV2:attemptJoining', undefined)
})
