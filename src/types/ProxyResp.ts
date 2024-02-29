import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'
import { DeSerializeFromJsonString, SerializeToJsonString } from '../utils'

const cProxyRespVersion = 1

export type ProxyResp = {
  success: boolean
  response: unknown
}

export function serializeProxyResp(stream: VectorBufferStream, obj: ProxyResp, root = false): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cProxyResp)
  }
  stream.writeUInt8(cProxyRespVersion)
  stream.writeUInt8(obj.success ? 1 : 0)
  stream.writeString(SerializeToJsonString(obj.response))
}

export function deserializeProxyResp(stream: VectorBufferStream): ProxyResp {
  const version = stream.readUInt8()
  if (version > cProxyRespVersion) {
    throw new Error('ProxyResp version mismatch')
  }
  return {
    success: stream.readUInt8() === 1,
    response: DeSerializeFromJsonString(stream.readString()),
  }
}
