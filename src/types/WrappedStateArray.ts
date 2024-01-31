import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'

export type WrappedGAD3Array = WrappedGAD3[]
export interface WrappedGAD3 {
  /** Account ID */
  accountId: string
  /** hash of the data blob */
  stateId: string
  /** data blob opaque */
  data: Buffer
  /** Timestamp */
  timestamp: number
  /** optional data related to sync process */
  syncData?: Buffer
}

export const cWGAD3Ver = 1

export function serializeWGAD3(stream: VectorBufferStream, obj: WrappedGAD3, root = false): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cWrappedGAD3)
  }
  stream.writeUInt16(cWGAD3Ver)
  stream.writeString(obj.accountId)
  stream.writeString(obj.stateId)
  stream.writeBuffer(obj.data)
  stream.writeString(obj.timestamp.toString())
  stream.writeUInt8(obj.syncData ? 1 : 0)
  if (obj.syncData) {
    stream.writeBuffer(obj.syncData)
  }
}

export function deserializeWGAD3(stream: VectorBufferStream): WrappedGAD3 {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const version = stream.readUInt16()
  const accountId = stream.readString()
  const stateId = stream.readString()
  const data = stream.readBuffer()
  const timestamp = parseInt(stream.readString())
  let syncData
  if (stream.readUInt8() === 1) {
    syncData = stream.readBuffer()
  }

  return {
    accountId,
    stateId,
    data,
    timestamp,
    syncData,
  }
}

const cWGAD3ArrVer = 1

export function serializeWGAD3Array(stream: VectorBufferStream, array: WrappedGAD3Array, root = false): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cWrappedGAD3Array)
  }
  stream.writeUInt16(cWGAD3ArrVer)
  stream.writeUInt16(array.length)
  for (const item of array) {
    serializeWGAD3(stream, item)
  }
}

export function deserializeWGAD3Array(stream: VectorBufferStream): WrappedGAD3Array {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const version = stream.readUInt16()
  const len = stream.readUInt16()
  const arr: WrappedGAD3Array = []
  for (let i = 0; i < len; i++) {
    arr.push(deserializeWGAD3(stream))
  }
  return arr
}
