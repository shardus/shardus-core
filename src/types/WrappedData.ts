import { stateManager } from '../p2p/Context'
import { DeSerializeFromJsonString, SerializeToJsonString } from '../utils'
import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { AppObjEnum } from './enum/AppObjEnum'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'

export const cWrappedDataVersion = 1
export interface WrappedData {
  accountId: string
  stateId: string // hash of the data blob
  data: unknown // data blob opaqe
  timestamp: number
  syncData?: unknown
}

export function serializeWrappedData(stream: VectorBufferStream, obj: WrappedData, root = false): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cWrappedData)
  }
  stream.writeUInt16(cWrappedDataVersion)
  stream.writeString(obj.accountId)
  stream.writeString(obj.stateId)
  stream.writeBuffer(stateManager.app.binarySerializeObject(AppObjEnum.AppData, obj.data))
  stream.writeString(obj.timestamp.toString())
  if (obj.syncData !== undefined) {
    stream.writeUInt8(1)
    stream.writeString(SerializeToJsonString(obj.syncData))
  } else {
    stream.writeUInt8(0)
  }
}

export function deserializeWrappedData(stream: VectorBufferStream): WrappedData {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const version = stream.readUInt16()
  if (version > cWrappedDataVersion) {
    throw new Error(`Unsupported WrappedData version ${version}`)
  }
  return {
    accountId: stream.readString(),
    stateId: stream.readString(),
    data: stateManager.app.binaryDeserializeObject(AppObjEnum.AppData, stream.readBuffer()),
    timestamp: Number(stream.readString()),
    syncData: stream.readUInt8() === 1 ? DeSerializeFromJsonString(stream.readString()) : undefined,
  }
}
