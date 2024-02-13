import { VectorBufferStream } from "../utils/serialization/VectorBufferStream";
import { TypeIdentifierEnum } from "./enum/TypeIdentifierEnum";
import { deserializeWrappedData, serializeWrappedData, WrappedData } from "./WrappedData";


export interface StateTableObject {
  /** Account ID */
  accountId: string
  /** Transaction ID */
  txId: string
  /** Transaction Timestamp */
  txTimestamp: string
  /** The hash of the state before applying the transaction */
  stateBefore: string
  /** The hash of the state after applying the transaction */
  stateAfter: string
}

export type GetAccountDataByHashesResp = {
  accounts: WrappedData[]
  stateTableData: StateTableObject[] //TODO depricate this
}

export const cGetAccountDataByHashesRespVersion = 1;

export const serializeGetAccountDataByHashesResp = (stream: VectorBufferStream, inp: GetAccountDataByHashesResp, root = false): void => {
  if(root) {
    stream.writeUInt32(TypeIdentifierEnum.cGetAccountDataByHashesResp);
  }

  stream.writeUInt8(cGetAccountDataByHashesRespVersion);
  stream.writeUInt32(inp.accounts.length || 0);
  for(let i = 0; i < inp.accounts.length; i++) {
    serializeWrappedData(stream, inp.accounts[i]);
  }
  stream.writeUInt32(inp.stateTableData.length || 0);
  for(let i = 0; i < inp.stateTableData.length; i++) {
    stream.writeString(inp.stateTableData[i].accountId);
    stream.writeString(inp.stateTableData[i].txId);
    stream.writeString(inp.stateTableData[i].txTimestamp);
    stream.writeString(inp.stateTableData[i].stateBefore);
    stream.writeString(inp.stateTableData[i].stateAfter);
  }
}

export const deserializeGetAccountDataByHashesResp = (stream: VectorBufferStream): GetAccountDataByHashesResp => {
  const version = stream.readUInt8();
  if(version !== cGetAccountDataByHashesRespVersion) {
    throw new Error(`GetAccountDataByHashesRespDeserializer expected version cGetAccountDataByHashesRespVersion, got ${version}`);
  }
  const result: GetAccountDataByHashesResp = {
    accounts: [],
    stateTableData: []
  };
  const accountsLength = stream.readUInt32();
  for(let i = 0; i < accountsLength; i++) {
    result.accounts.push(deserializeWrappedData(stream));
  }
  const stateTableDataLength = stream.readUInt32();
  for(let i = 0; i < stateTableDataLength; i++) {
    result.stateTableData.push({
      accountId: stream.readString(),
      txId: stream.readString(),
      txTimestamp: stream.readString(),
      stateBefore: stream.readString(),
      stateAfter: stream.readString()
    });
  }
  return result;
}
