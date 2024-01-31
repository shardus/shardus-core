import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { WrappedGAD3Array, deserializeWGAD3Array, serializeWGAD3Array } from './WrappedStateArray'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'

export type getAccountData3Array = {
  wrappedAccounts: WrappedGAD3Array
  lastUpdateNeeded: boolean
  wrappedAccounts2: WrappedGAD3Array
  highestTs: number
  delta: number
}

export const cGetAccountData3ArrayVersion = 1

export function serializeGetAccountData3Array(
  stream: VectorBufferStream,
  obj: getAccountData3Array,
  root = false
): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cGetAccountData3Array)
  }
  stream.writeUInt16(cGetAccountData3ArrayVersion)
  serializeWGAD3Array(stream, obj.wrappedAccounts)
  stream.writeUInt8(obj.lastUpdateNeeded ? 1 : 0)
  serializeWGAD3Array(stream, obj.wrappedAccounts2)
  stream.writeUInt32(obj.highestTs)
  stream.writeUInt32(obj.delta)
}

export function deserializeGetAccountData3Array(stream: VectorBufferStream): getAccountData3Array {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const version = stream.readUInt16()
  const wrappedAccounts = deserializeWGAD3Array(stream)
  const lastUpdateNeeded = stream.readUInt8() === 1
  const wrappedAccounts2 = deserializeWGAD3Array(stream)
  const highestTs = stream.readUInt32()
  const delta = stream.readUInt32()

  return {
    wrappedAccounts,
    lastUpdateNeeded,
    wrappedAccounts2,
    highestTs,
    delta,
  }
}
