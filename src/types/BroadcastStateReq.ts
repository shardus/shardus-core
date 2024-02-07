import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import {
  WrappedDataResponse,
  deserializeWrappedDataResponse,
  serializeWrappedDataResponse,
} from './WrappedDataResponse'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'

export const cBroadcastStateReqVersion = 1

export interface BroadcastStateReq {
  txid: string
  stateList: WrappedDataResponse[]
}

export function serializeBroadcastStateReq(
  stream: VectorBufferStream,
  obj: BroadcastStateReq,
  root = false
): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cBroadcastStateReq)
  }
  stream.writeUInt16(cBroadcastStateReqVersion)
  stream.writeString(obj.txid)
  stream.writeUInt16(obj.stateList.length) // Serialize array length
  obj.stateList.forEach((item) => serializeWrappedDataResponse(stream, item)) // Serialize each item
}

export function deserializeBroadcastStateReq(stream: VectorBufferStream): BroadcastStateReq {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const version = stream.readUInt16()
  const txid = stream.readString()
  const stateListLength = stream.readUInt16()
  const stateList = Array.from({ length: stateListLength }, () => deserializeWrappedDataResponse(stream))
  return { txid, stateList }
}
