import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'
import { DeSerializeFromJsonString, SerializeToJsonString } from '../utils'

const cProxyReqVersion = 1

export type ProxyReq = {
  nodeId: string
  route: string
  message: unknown
}

export function serializeProxyReq(stream: VectorBufferStream, obj: ProxyReq, root = false): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cProxyReq)
  }
  stream.writeUInt8(cProxyReqVersion)
  stream.writeString(obj.nodeId)
  stream.writeString(obj.route)
  stream.writeString(SerializeToJsonString(obj.message))
}

export function deserializeProxyReq(stream: VectorBufferStream): ProxyReq {
  const version = stream.readUInt8()
  if (version > cProxyReqVersion) {
    throw new Error('ProxyReq version mismatch')
  }
  return {
    nodeId: stream.readString(),
    route: stream.readString(),
    message: DeSerializeFromJsonString(stream.readString()),
  }
}
