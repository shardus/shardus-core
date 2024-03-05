import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'

export const cWrappedRespVersion = 1

export interface ResponseError {
 Code: number
 AppCode: number
 Message: string
 Throwable: boolean
}


export interface WrappedResp {
  payload?: Buffer
  responseError?: ResponseError
}

export function serializeWrappedResp(stream: VectorBufferStream, obj: WrappedResp, root = false): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cWrappedResp)
  }
  stream.writeUInt8(cWrappedRespVersion)
  stream.writeUInt8(obj.responseError ? 1 : 0)
  if (obj.responseError) {
    serializeResponseError(stream, obj.responseError)
  }

  stream.writeUInt8(obj.payload ? 1 : 0)
  if (obj.payload){
    stream.writeBuffer(obj.payload)
  }
}

export function deserializeWrappedResp(stream: VectorBufferStream): WrappedResp {
  const version = stream.readUInt8()
  if (version > cWrappedRespVersion) {
    throw new Error('WrappedResp version mismatch')
  }
  const hasResponseError = stream.readUInt8() === 1
  let responseError = undefined
  if (hasResponseError) {
    responseError = deserializeResponseError(stream)
  }
  const hasPayload = stream.readUInt8() === 1
  let payload = undefined
  if (hasPayload) {
    payload = stream.readBuffer()
  }
  return {
    payload,
    responseError
  }
}

export function serializeResponseError(stream: VectorBufferStream, obj: ResponseError) {
  stream.writeUInt32(obj.Code)
  stream.writeUInt32(obj.AppCode)
  stream.writeString(obj.Message)
  stream.writeUInt8(obj.Throwable ? 1 : 0)
}

export function deserializeResponseError(stream: VectorBufferStream): ResponseError {
  return {
    Code: stream.readUInt32(),
    AppCode: stream.readUInt32(),
    Message: stream.readString(),
    Throwable: stream.readUInt8() === 1
  }
}
