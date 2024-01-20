import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'

export const cCachedAppData = 7 
export const cCachedAppDataVersion = 1


export type CachedAppData = {
    cycle: number
    appData: Buffer
    dataID: string
}

export function serializeCachedAppData (
    stream: VectorBufferStream, 
    obj: CachedAppData,
    root = false
): void {
    if(root) {
        stream.writeUInt16(cCachedAppData)
    }
    stream.writeUInt16(cCachedAppDataVersion)
    stream.writeUInt32(obj.cycle)
    stream.writeBuffer(obj.appData)
    stream.writeString(obj.dataID)
}

export function deserializeCachedAppData (
  stream: VectorBufferStream,
  root = false
): CachedAppData {
  if(root) {
    const type = stream.readUInt16()
    if(type !== cCachedAppData) {
      throw new Error(`Expected ${cCachedAppData} but got ${type}`)
    }
  }
  const version = stream.readUInt16()
  if(version !== cCachedAppDataVersion) {
    throw new Error(`Expected ${cCachedAppDataVersion} but got ${version}`)
  }
  const cycle = stream.readUInt32()
  const appData = stream.readBuffer()
  const dataID = stream.readString()
  return {
    cycle,
    appData,
    dataID
  }
}
