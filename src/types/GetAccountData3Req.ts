import { GetAccountData3Req } from "../state-manager/state-manager-types";
import { VectorBufferStream } from "../utils/serialization/VectorBufferStream";
import { TypeIdentifierEnum } from "./enum/TypeIdentifierEnum";

export const cGetAccountData3ReqVersion = 1;

// export type GetAccountData3Req = {
//     accountStart: string
//     accountEnd: string
//     tsStart: number
//     maxRecords: number
//     offset: number
//     accountOffset: string
//   }
  
  export function serializeGetAccountData3Req(stream: VectorBufferStream, obj: GetAccountData3Req, root = false) : void {
      if (root) {
          stream.writeUInt16(TypeIdentifierEnum.cGetAccountData3Req);
      }
      stream.writeUInt16(cGetAccountData3ReqVersion);
      stream.writeString(obj.accountStart);
      stream.writeString(obj.accountEnd);
      stream.writeUInt32(obj.tsStart);
      stream.writeUInt32(obj.maxRecords);
      stream.writeUInt32(obj.offset);
      stream.writeString(obj.accountOffset);
  }
  
  export function deserializeGetAccountData3Req(stream: VectorBufferStream): GetAccountData3Req {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const version = stream.readUInt16();
      const accountStart = stream.readString();
      const accountEnd = stream.readString();
      const tsStart = stream.readUInt32();
      const maxRecords = stream.readUInt32();
      const offset = stream.readUInt32();
      const accountOffset = stream.readString();
  
      const obj: GetAccountData3Req = {
          accountStart,
          accountEnd,
          tsStart,
          maxRecords,
          offset,
          accountOffset,
      };
  
      return obj;
  }
  