import { VectorBufferStream } from "../utils/serialization/VectorBufferStream";
import { TypeIdentifierEnum } from "./enum/TypeIdentifierEnum";

export type getTxTimestampReq = { txId: string, cycleCounter: number, cycleMarker: string }

export const cGetTxTimestampReqVersion = 1;


export function serializeGetTxTimestampReq(stream: VectorBufferStream, obj: getTxTimestampReq, root = false) : void {
    if (root) {
        stream.writeUInt16(TypeIdentifierEnum.cGetTxTimestamp);
    }
    stream.writeUInt16(cGetTxTimestampReqVersion);
    const jsonString = JSON.stringify(obj);
    stream.writeString(jsonString);
}

export function deserializeGetTxTimestampReq(stream: VectorBufferStream): getTxTimestampReq {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const version = stream.readUInt16();
    const jsonString = stream.readString();
    const obj: getTxTimestampReq = JSON.parse(jsonString);
    return obj;
}

// Schema definition
