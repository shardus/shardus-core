import { AccountRepairInstruction } from '../state-manager/AccountPatcher'
import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { deserializeSignedReceipt, serializeSignedReceipt } from './SignedReceipt'
import { deserializeWrappedData, serializeWrappedData } from './WrappedData'
import { verifyPayload } from './ajv/Helpers'
import { AJVSchemaEnum } from './enum/AJVSchemaEnum'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'

export type RepairOOSAccountsReq = {
  repairInstructions: AccountRepairInstruction[]
}

export const cRepairOOSAccountsReqVersion = 1

//TODO: add file in /ajv folder
// Two enums

export const serializeRepairOOSAccountsReq = (
  stream: VectorBufferStream,
  inp: RepairOOSAccountsReq,
  root = false
): void => {
  // const errors = verifyPayload(AJVSchemaEnum.RepairOOSAccountsReq', inp)
  // if (errors && errors.length > 0) {
  //   throw new Error('Data validation error')
  // }
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cRepairOOSAccountsReq)
  }

  stream.writeUInt8(cRepairOOSAccountsReqVersion)
  stream.writeUInt32(inp.repairInstructions.length || 0)
  for (let i = 0; i < inp.repairInstructions.length; i++) {
    // eslint-disable-next-line security/detect-object-injection
    stream.writeString(inp.repairInstructions[i].accountID)
    // eslint-disable-next-line security/detect-object-injection
    stream.writeString(inp.repairInstructions[i].hash)
    // eslint-disable-next-line security/detect-object-injection
    stream.writeString(inp.repairInstructions[i].txId)
    // eslint-disable-next-line security/detect-object-injection
    serializeWrappedData(stream, inp.repairInstructions[i].accountData)
    // eslint-disable-next-line security/detect-object-injection
    stream.writeString(inp.repairInstructions[i].targetNodeId)
    // eslint-disable-next-line security/detect-object-injection
    serializeSignedReceipt(stream, inp.repairInstructions[i].signedReceipt)
  }
}

export const deserializeRepairOOSAccountsReq = (stream: VectorBufferStream): RepairOOSAccountsReq => {
  const version = stream.readUInt8()
  if (version !== cRepairOOSAccountsReqVersion) {
    throw new Error(
      `RepairOOSAccountsReqDeserializer expected version ${cRepairOOSAccountsReqVersion}, got ${version}`
    )
  }
  const repairInstructionsLength = stream.readUInt32()
  const result: RepairOOSAccountsReq = {
    repairInstructions: [],
  }
  for (let i = 0; i < repairInstructionsLength; i++) {
    result.repairInstructions.push({
      accountID: stream.readString(),
      hash: stream.readString(),
      txId: stream.readString(),
      accountData: deserializeWrappedData(stream),
      targetNodeId: stream.readString(),
      signedReceipt: deserializeSignedReceipt(stream),
    })
  }
  const errors = verifyPayload(AJVSchemaEnum.RepairOOSAccountsReq, result)
  if (errors && errors.length > 0) {
    throw new Error('AJV: Data validation error ->' + errors.join(', '))
  }
  return result
}
