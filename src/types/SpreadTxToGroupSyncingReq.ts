import {
  AcceptedTx,
  OpaqueTransaction,
  ShardusMemoryPatternsInput,
  TransactionKeys,
} from '../shardus/shardus-types'
import { DeSerializeFromJsonString, SerializeToJsonString } from '../utils'
import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'

const cSpreadTxToGroupSyncingReqVersion = 1
export type SpreadTxToGroupSyncingReq = {
  timestamp: number
  txId: string
  keys: TransactionKeys
  data: OpaqueTransaction
  appData: any
  shardusMemoryPatterns: ShardusMemoryPatternsInput
}

export function serializeSpreadTxToGroupSyncingReq(
  stream: VectorBufferStream,
  inp: SpreadTxToGroupSyncingReq,
  root = false
): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cSpreadTxToGroupSyncingReq)
  }
  stream.writeUInt16(cSpreadTxToGroupSyncingReqVersion)
  stream.writeBigUInt64(BigInt(inp.timestamp))
  stream.writeString(inp.txId)
  stream.writeString(SerializeToJsonString(inp.keys))
  const dataBuffer = Buffer.from(SerializeToJsonString(inp.data), 'utf8')
  stream.writeBuffer(dataBuffer)
  stream.writeString(SerializeToJsonString(inp.appData))
  stream.writeString(SerializeToJsonString(inp.shardusMemoryPatterns))
}

export function deserializeSpreadTxToGroupSyncingReq(stream: VectorBufferStream): SpreadTxToGroupSyncingReq {
  const version = stream.readUInt16()
  if (version > cSpreadTxToGroupSyncingReqVersion) {
    throw new Error('Unsupported version')
  }
  const dataBuffer = stream.readBuffer()
  const dataString = dataBuffer.toString('utf8')
  return {
    timestamp: Number(stream.readBigUInt64()),
    txId: stream.readString(),
    keys: DeSerializeFromJsonString(stream.readString()),
    data: DeSerializeFromJsonString(dataString),
    appData: DeSerializeFromJsonString(stream.readString()),
    shardusMemoryPatterns: DeSerializeFromJsonString(stream.readString()),
  }
}
