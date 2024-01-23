import { VectorBufferStream } from "../utils/serialization/VectorBufferStream";
import { TypeIdentifierEnum } from "./enum/TypeIdentifierEnum";
import { serializeWrappedData, WrappedData } from "./WrappedData";

export interface WrappedDataFromQueueSerialized extends Omit<WrappedData, 'accountCreated'> {
  seenInQueue: boolean;
}

export const cWrappedDataFromQueueVersion = 1;

export function serializeWrappedDataFromQueue(stream: VectorBufferStream, obj: WrappedDataFromQueueSerialized, root = false): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cWrappedDataFromQueue);
  }
  stream.writeUInt8(cWrappedDataFromQueueVersion);

  stream.writeUInt8(obj.seenInQueue ? 1 : 0);
  stream.writeUInt8(obj.isPartial ? 1 : 0);
  stream.writeString(obj.accountId);
  stream.writeString(obj.stateId);
  stream.writeDouble(obj.timestamp);
  stream.writeBuffer(Buffer.from(obj.data));

}

export function deserializeWrappedDataFromQueue(stream: VectorBufferStream): WrappedDataFromQueueSerialized {
  const obj: WrappedDataFromQueueSerialized = {
    seenInQueue: false,
    isPartial: false,
    accountId: '',
    stateId: '',
    timestamp: 0,
    data: Buffer.from(''),
  };
  const version = stream.readUInt8();
  if (version !== 1) {
    throw new Error(`Expected version 1. Actual version: ${version}`);
  }
  obj.seenInQueue = stream.readUInt8() === 1;
  obj.isPartial = stream.readUInt8() === 1;
  obj.accountId = stream.readString();
  obj.stateId = stream.readString();
  obj.timestamp = stream.readDouble(); 
  obj.data = stream.readBuffer();
  return obj;
}
