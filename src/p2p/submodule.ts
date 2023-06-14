import { P2P } from '@shardus/types'

export interface Submodule<T, R> {
  init: () => void
  sendRequests: () => void
  queueRequest: (req: unknown) => void
  reset: () => void
  getTxs: () => T
  updateRecord: (
    txs: T,
    record: P2P.CycleCreatorTypes.CycleRecord,
    prev: P2P.CycleCreatorTypes.CycleRecord
  ) => void
  validateRecordTypes: (rec: R) => string
}
