import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'

export type SyncTrieHashesRequest = {
  cycle: number
  nodeHashes: { radix: string; hash: string }[]
}

const cSyncTrieHashesReqVersion = 1

export function serializeSyncTrieHashesReq(
  stream: VectorBufferStream,
  request: SyncTrieHashesRequest,
  root = false
): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cSyncTrieHashesReq)
  }
  stream.writeUInt16(cSyncTrieHashesReqVersion)
  stream.writeUInt32(request.cycle)
  stream.writeUInt16(request.nodeHashes.length)
  for (const nodeHash of request.nodeHashes) {
    stream.writeString(nodeHash.radix)
    stream.writeString(nodeHash.hash)
  }
}

export function deserializeSyncTrieHashesReq(stream: VectorBufferStream): SyncTrieHashesRequest {
  const version = stream.readUInt16()
  if (version > cSyncTrieHashesReqVersion) {
    throw new Error('Unsupported version')
  }
  const cycle = stream.readUInt32()
  const nodeHashesLength = stream.readUInt16()
  const nodeHashes = []
  for (let i = 0; i < nodeHashesLength; i++) {
    const radix = stream.readString()
    const hash = stream.readString()
    nodeHashes.push({ radix, hash })
  }
  return {
    cycle,
    nodeHashes,
  }
}
