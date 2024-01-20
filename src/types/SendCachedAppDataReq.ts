import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { CachedAppData, deserializeCachedAppData, serializeCachedAppData } from './CachedAppData'

export const cSendCachedAppDataReq = 8
export const cSendCachedAppDataReqVersion = 1

export type SendCachedAppDataReq = {
  topic: string
  cachedAppData: CachedAppData 
}

export function serializeSendCachedAppDataReq (
  stream: VectorBufferStream, 
  obj: SendCachedAppDataReq,
  root = false
): void {
  if(root) {
    stream.writeUInt16(cSendCachedAppDataReq)
  }
  stream.writeUInt16(cSendCachedAppDataReqVersion)
  stream.writeString(obj.topic)
  serializeCachedAppData(stream, obj.cachedAppData)
}

export function deserializeSendCachedAppDataReq (
  stream: VectorBufferStream,
  root = false
): SendCachedAppDataReq {
  if(root) {
    const type = stream.readUInt16()
    if(type !== cSendCachedAppDataReq) {
      throw new Error(`Expected ${cSendCachedAppDataReq} but got ${type}`)
    }
  }
  const version = stream.readUInt16()
  if(version !== cSendCachedAppDataReqVersion) {
    throw new Error(`Expected ${cSendCachedAppDataReqVersion} but got ${version}`)
  }
  const topic = stream.readString()
  const cachedAppData = deserializeCachedAppData(stream)
  return {
    topic,
    cachedAppData
  }
}



