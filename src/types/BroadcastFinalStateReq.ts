import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { WrappedData, deserializeWrappedData, serializeWrappedData } from './WrappedData'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'

export const cBroadcastFinalStateReqVersion = 1

export interface BroadcastFinalStateReq {
  txid: string
  stateList: WrappedData[]
}

export function serializeBroadcastFinalStateReq(
  stream: VectorBufferStream,
  obj: BroadcastFinalStateReq,
  root = false
): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cBroadcastFinalStateReq)
  }
  stream.writeUInt16(cBroadcastFinalStateReqVersion)
  stream.writeString(obj.txid)
  stream.writeUInt16(obj.stateList.length) // Serialize array length
  obj.stateList.forEach((item) => serializeWrappedData(stream, item)) // Serialize each item; we are reusing the same serializer from serialiseBroadcastReq
}

export function deserializeBroadcastFinalStateReq(stream: VectorBufferStream): BroadcastFinalStateReq {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const version = stream.readUInt16()
  const txid = stream.readString()
  const stateListLength = stream.readUInt16()
  const stateList = Array.from({ length: stateListLength }, () => deserializeWrappedData(stream))
  return { txid, stateList }
}
