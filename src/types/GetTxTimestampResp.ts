import { VectorBufferStream } from "../utils/serialization/VectorBufferStream";
import { TypeIdentifierEnum } from "./enum/TypeIdentifierEnum";
import * as Shardus from '../shardus/shardus-types'


export type getTxTimestampResp = Shardus.TimestampReceipt

const cGetTxTimestampRespVersion = 1;

export function serializeGetTxTimestampResp(stream: VectorBufferStream, obj: getTxTimestampResp, root = false) : void {
    if (root) {
        stream.writeUInt16(TypeIdentifierEnum.cGetTxTimestamp);
    }
    stream.writeUInt16(cGetTxTimestampRespVersion);
    const jsonString = JSON.stringify(obj);
    stream.writeString(jsonString);
}

export function deserializeGetTxTimestampResp(stream: VectorBufferStream): getTxTimestampResp {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const version = stream.readUInt16();
    const jsonString = stream.readString();
    const obj: getTxTimestampResp = JSON.parse(jsonString);
    return obj;
}
