import { stateManager } from '../p2p/Context'
import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { AppObjEnum } from './enum/AppObjEnum'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'

export type GlobalAccountReportReqSerializable = {}
const cGlobalAccountReportReqVersion = 1

export function serializeGlobalAccountReportReq(
  stream: VectorBufferStream,
  obj: GlobalAccountReportReqSerializable,
  root = false
): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cGlobalAccountReportReq)
  }
  stream.writeUInt8(cGlobalAccountReportReqVersion)
}

export function deserializeGlobalAccountReportReq(
  stream: VectorBufferStream
): GlobalAccountReportReqSerializable {
  const version = stream.readUInt8()
  if (version > cGlobalAccountReportReqVersion) {
    throw new Error('GlobalAccountReportReqSerializable version mismatch')
  }

  const req: GlobalAccountReportReqSerializable = {}
  return req
}
