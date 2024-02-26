
import { AppliedReceipt2, AppliedVote, ConfirmOrChallengeMessage } from "../state-manager/state-manager-types";
import { VectorBufferStream } from "../utils/serialization/VectorBufferStream";
import { TypeIdentifierEnum } from "./enum/TypeIdentifierEnum";

//original type for this is not nullable for receipt attr but the caller/callee code is written in a way it is nullable
export type RequestReceiptForTxRespSerialized = { receipt: AppliedReceipt2 | null; note: string; success: boolean }

export const cRequestReceiptForTxRespVersion = 1;
export function serializeRequestReceiptForTxResp(stream: VectorBufferStream, inp: RequestReceiptForTxRespSerialized, root = false): void {
  if(root) {
    stream.writeUInt16(TypeIdentifierEnum.cRequestReceiptForTxResp);
  }
  stream.writeUInt8(cRequestReceiptForTxRespVersion);

  if(inp.receipt === null) {
    stream.writeUInt8(0);
    stream.writeString(inp.note);
    stream.writeUInt8(inp.success ? 1 : 0);
    return;
  }else{
    stream.writeUInt8(1);
  }
  serializeAppliedReceipt2(stream, inp.receipt);
  stream.writeString(inp.note);
  stream.writeUInt8(inp.success ? 1 : 0);
}
export function deserializeRequestReceiptForTxResp(stream: VectorBufferStream): RequestReceiptForTxRespSerialized {
  const version = stream.readUInt8();
  if(version !== cRequestReceiptForTxRespVersion) {
    throw new Error('RequestReceiptForTxResp version mismatch');
  }
  if(stream.readUInt8() === 0) {
    const note = stream.readString();
    const success = stream.readUInt8() === 1;
    return { receipt: null, note, success };
  }
  const receipt = deserializeAppliedReceipt2(stream);
  const note = stream.readString();
  const success = stream.readUInt8() === 1;
  return { receipt, note, success };
}

export const cAppliedReceipt2Version = 1;
export function serializeAppliedReceipt2(stream: VectorBufferStream, inp: AppliedReceipt2): void {
  stream.writeUInt8(cAppliedReceipt2Version);
  stream.writeString(inp.txid);
  stream.writeUInt8(inp.result ? 1 : 0);
  serializeAppliedVote(stream, inp.appliedVote);
  serializeConfirmOrChallengeMessage(stream, inp.confirmOrChallenge);

  stream.writeUInt16(inp.signatures.length);
  for(let i = 0; i < inp.signatures.length; i++) {
    stream.writeString(inp.signatures[i].owner);
    stream.writeString(inp.signatures[i].sig);
  }

  stream.writeString(inp.app_data_hash);
}
export function deserializeAppliedReceipt2(stream: VectorBufferStream): AppliedReceipt2 {
  const version = stream.readUInt8();
  if(version !== cAppliedReceipt2Version) {
    throw new Error('AppliedReceipt2 version mismatch');
  }
  const txid = stream.readString();
  const result = stream.readUInt8() === 1;
  const appliedVote = deserializeAppliedVote(stream);
  const confirmOrChallenge = deserializeConfirmOrChallengeMessage(stream);
  const signatures_length = stream.readUInt16();
  const signatures = new Array(signatures_length);
  for(let i = 0; i < signatures_length; i++) {
    signatures[i] = {
      owner: stream.readString(),
      sig: stream.readString()
    };
  }
  const app_data_hash = stream.readString();
  return { txid, result, appliedVote, confirmOrChallenge, signatures, app_data_hash };
}

export const cConfirmOrChallengeMessageVersion = 1;
export function serializeConfirmOrChallengeMessage(stream: VectorBufferStream, inp: ConfirmOrChallengeMessage): void {
  stream.writeUInt8(cConfirmOrChallengeMessageVersion);
  stream.writeString(inp.message);
  stream.writeString(inp.nodeId);
  serializeAppliedVote(stream, inp.appliedVote);
  if(inp.sign && inp.sign.owner && inp.sign.sig) {
    stream.writeUInt8(1);
    stream.writeString(inp.sign.owner);
    stream.writeString(inp.sign.sig);
  }
  else {
    stream.writeUInt8(0);
  }
}
export function deserializeConfirmOrChallengeMessage(stream: VectorBufferStream): ConfirmOrChallengeMessage {
  const version = stream.readUInt8();
  if(version !== cConfirmOrChallengeMessageVersion) {
    throw new Error('ConfirmOrChallengeMessage version mismatch');
  }
  const message = stream.readString();
  const nodeId = stream.readString();
  const appliedVote = deserializeAppliedVote(stream);
  let sign = null;
  if(stream.readUInt8() === 1) {
    sign = {
      owner: stream.readString(),
      sig: stream.readString()
    };
  }
  return { message, nodeId, appliedVote, sign };
}

export const cAppliedVoteVersion = 1;
export function serializeAppliedVote(stream: VectorBufferStream, inp: AppliedVote): void {
  stream.writeUInt8(cAppliedVoteVersion);
  stream.writeString(inp.txid);
  stream.writeUInt8(inp.transaction_result ? 1 : 0);
  stream.writeUInt16(inp.account_id.length);
  for(let i = 0; i < inp.account_id.length; i++) {
    stream.writeString(inp.account_id[i]);
  }
  stream.writeUInt16(inp.account_state_hash_after.length);
  for(let i = 0; i < inp.account_state_hash_after.length; i++) {
    stream.writeString(inp.account_state_hash_after[i]);
  }
  stream.writeUInt16(inp.account_state_hash_before.length);
  for(let i = 0; i < inp.account_state_hash_before.length; i++) {
    stream.writeString(inp.account_state_hash_before[i]);
  }
  stream.writeUInt8(inp.cant_apply ? 1 : 0);
  stream.writeString(inp.node_id);

  if(inp.sign && inp.sign.owner && inp.sign.sig) {
    stream.writeUInt8(1);
    stream.writeString(inp.sign.owner);
    stream.writeString(inp.sign.sig);
  }else{
    stream.writeUInt8(0);
  }

  stream.writeString(inp.app_data_hash);
}

export function deserializeAppliedVote(stream: VectorBufferStream): AppliedVote {
  const version = stream.readUInt8();
  if(version !== cAppliedVoteVersion) {
    throw new Error('AppliedVote version mismatch');
  }

  const txid = stream.readString();
  const transaction_result = stream.readUInt8() === 1;
  const account_id_length = stream.readUInt16();
  const account_id = new Array(account_id_length);
  for(let i = 0; i < account_id_length; i++) {
    account_id[i] = stream.readString();
  }
  const account_state_hash_after_length = stream.readUInt16();
  const account_state_hash_after = new Array(account_state_hash_after_length);
  for(let i = 0; i < account_state_hash_after_length; i++) {
    account_state_hash_after[i] = stream.readString();
  }

  const account_state_hash_before_length = stream.readUInt16();
  const account_state_hash_before = new Array(account_state_hash_before_length);
  for(let i = 0; i < account_state_hash_before_length; i++) {
    account_state_hash_before[i] = stream.readString();
  }
  const cant_apply = stream.readUInt8() === 1;
  const node_id = stream.readString();
  let sign = null;
  if(stream.readUInt8() === 1) {
    sign = {
      owner: stream.readString(),
      sig: stream.readString()
    };
  }
  const app_data_hash = stream.readString();

  return { txid, transaction_result, account_id, account_state_hash_after, account_state_hash_before, cant_apply, node_id, sign, app_data_hash };
}
