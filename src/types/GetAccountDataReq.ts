import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'

export type GetAccountDataReqSerializable = {
  accountStart: string
  accountEnd: string
  tsStart: number
  maxRecords: number
  offset: number
  accountOffset: string
}

const cGetAccountDataReqVersion = 1

export function serializeGetAccountDataReq(
  stream: VectorBufferStream,
  inp: GetAccountDataReqSerializable,
  root = false
): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cGetAccountDataReq)
  }
  stream.writeUInt8(cGetAccountDataReqVersion)
  stream.writeString(inp.accountStart)
  stream.writeString(inp.accountEnd)
  stream.writeString(inp.tsStart.toString())
  stream.writeString(inp.maxRecords.toString())
  stream.writeString(inp.offset.toString())
  stream.writeString(inp.accountOffset)
}

export function deserializeGetAccountDataReq(stream: VectorBufferStream): GetAccountDataReqSerializable {
  const version = stream.readUInt8()
  if (version > cGetAccountDataReqVersion) {
    throw new Error('GetAccountDataReq version mismatch')
  }
  const obj: GetAccountDataReqSerializable = {
    accountStart: stream.readString(),
    accountEnd: stream.readString(),
    tsStart: Number(stream.readString()),
    maxRecords: Number(stream.readString()),
    offset: Number(stream.readString()),
    accountOffset: stream.readString(),
  }
  return obj
}
