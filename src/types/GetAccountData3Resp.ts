import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { deserializeGetAccountData3Array, serializeGetAccountData3Array } from './GetAccountData3Array'
import { WrappedGAD3Array } from './WrappedStateArray'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'

export type getAccountData3Array = {
  wrappedAccounts: WrappedGAD3Array
  lastUpdateNeeded: boolean
  wrappedAccounts2: WrappedGAD3Array
  highestTs: number
  delta: number
}

export type getAccountData3Resp = { data: getAccountData3Array; errors?: string[] }
export const cGetAccountData3Version = 1

export function serializeGetAccountData3Resp(stream: VectorBufferStream, obj: getAccountData3Resp, root = false): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cGetAccountData3Resp);
  }
  stream.writeUInt16(cGetAccountData3Version);
  serializeGetAccountData3Array(stream, obj.data);
  if (obj.errors) {
    stream.writeUInt8(1); // Indicate that errors are present
    stream.writeUInt16(obj.errors.length);
    obj.errors.forEach(error => stream.writeString(error));
  } else {
    stream.writeUInt8(0); // Indicate that errors are not present
  }
}

export function deserializeGetAccountData3Resp(stream: VectorBufferStream): getAccountData3Resp {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const version = stream.readUInt16();
  const data = deserializeGetAccountData3Array(stream);
  const errorsPresent = stream.readUInt8() === 1;
  let errors: string[] | undefined = undefined;
  if (errorsPresent) {
    const errorsCount = stream.readUInt16();
    errors = new Array(errorsCount);
    for (let i = 0; i < errorsCount; i++) {
      errors[i] = stream.readString();
    }
  }

  return { data, errors };
}

