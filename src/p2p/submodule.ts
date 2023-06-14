import { P2P } from '@shardus/types'

export interface Submodule {
  init: () => void
  sendRequests: () => void
  queueRequest: () => void
  reset: () => void
  getTxs: () => P2P.RotationTypes.Txs
  updateRecord: (
    txs: P2P.SafetyModeTypes.Txs | P2P.JoinTypes.Txs,
    record: P2P.CycleCreatorTypes.CycleRecord,
    prev: P2P.CycleCreatorTypes.CycleRecord
  ) => void
  validateRecordTypes: (rec: P2P.SafetyModeTypes.Record | P2P.JoinTypes.Record) => string
}
