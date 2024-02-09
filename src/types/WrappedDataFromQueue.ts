import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'
import { deserializeWrappedData, serializeWrappedData, WrappedData } from './WrappedData'

export const cWrappedDataFromQueueBinaryVersion = 1
export interface WrappedDataFromQueueSerializable extends WrappedData {
  seenInQueue: boolean
}

export const cWrappedDataFromQueueVersion = 1

export function serializeWrappedDataFromQueue(
  stream: VectorBufferStream,
  obj: WrappedDataFromQueueSerializable,
  root = false
): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cWrappedDataFromQueue)
  }
  stream.writeUInt16(cWrappedDataFromQueueVersion)
  serializeWrappedData(stream, obj)
  stream.writeUInt8(obj.seenInQueue ? 1 : 0)
}

export function deserializeWrappedDataFromQueue(
  stream: VectorBufferStream
): WrappedDataFromQueueSerializable {
  const version = stream.readUInt16()
  if (version > cWrappedDataFromQueueBinaryVersion) {
    throw new Error('Unsupported version')
  }
  const wrappedData = deserializeWrappedData(stream)
  return {
    ...wrappedData,
    seenInQueue: stream.readUInt8() === 1,
  }
}
