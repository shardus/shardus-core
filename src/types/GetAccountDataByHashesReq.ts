import { VectorBufferStream } from "../utils/serialization/VectorBufferStream";
import { TypeIdentifierEnum } from "./enum/TypeIdentifierEnum";

type AccountIDAndHash = {
  accountID: string
  hash: string
}
export type GetAccountDataByHashesReq = {
  cycle: number
  accounts: AccountIDAndHash[]
}

export const cGetAccountDataByHashesReqVersion = 1;

export const serializeGetAccountDataByHashesReq = (stream: VectorBufferStream, inp: GetAccountDataByHashesReq, root = false): void => {
  if(root) {
    stream.writeUInt32(TypeIdentifierEnum.cGetAccountDataByHashesReq);
  }

  stream.writeUInt8(cGetAccountDataByHashesReqVersion);
  stream.writeString(inp.cycle.toString());
  stream.writeUInt32(inp.accounts.length || 0);  
  for(let i = 0; i < inp.accounts.length; i++) {
    stream.writeString(inp.accounts[i].accountID);
    stream.writeString(inp.accounts[i].hash);
  }
}

export const deserializeGetAccountDataByHashesReq = (stream: VectorBufferStream): GetAccountDataByHashesReq => {
  const version = stream.readUInt8();
  if(version !== cGetAccountDataByHashesReqVersion) {
    throw new Error(`GetAccountDataByHashesReqDeserializer expected version cGetAccountDataByHashesReqVersion, got ${version}`);
  }
  const cycleNumber = Number(stream.readString())
  const accountsLength = stream.readUInt32();
  const result: GetAccountDataByHashesReq = {
    cycle: cycleNumber,
    accounts: new Array<AccountIDAndHash>(accountsLength) 
  };
  for(let i = 0; i < accountsLength; i++) {
    result.accounts.push({
      accountID: stream.readString(),
      hash: stream.readString()
    });
  }
  return result;
}
