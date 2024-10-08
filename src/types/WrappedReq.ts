import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'

export const cWrappedReqVersion = 1

export interface WrappedReq {
  payload: Buffer
}

export function serializeWrappedReq(stream: VectorBufferStream, obj: WrappedReq, root = false): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cWrappedReq)
  }
  stream.writeUInt16(cWrappedReqVersion)
  stream.writeBuffer(obj.payload)
}

export function deserializeWrappedReq(stream: VectorBufferStream): WrappedReq {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const version = stream.readUInt16()
  const payload = stream.readBuffer()

  const obj: WrappedReq = {
    payload,
  }

  return obj
}
