//import { AccountData } from "../shardus/shardus-types";

import { CycleRecord, CycleData } from '../p2p/CycleCreator'

//import { ShardGlobals } from "./shardFunctionTypes";

//import { WrappedData } from "../shardus/shardus-types";
//imports up top break the export, boo.

export type App = import('../shardus/shardus-types').App
export type QueueEntry = {
  acceptedTx: import('../shardus/shardus-types').AcceptedTx
  txKeys: import('../shardus/shardus-types').TransactionKeys
  collectedData: any
  originalData: any
  homeNodes: {
    [accountID: string]: import('./shardFunctionTypes').NodeShardData
  }
  patchedOnNodes: Map<string, import('./shardFunctionTypes').NodeShardData> //{[accountID:string]:import('./shardFunctionTypes').NodeShardData};
  hasShardInfo: boolean
  state: string
  dataCollected: number
  hasAll: boolean
  /**
   * based on the incrementing queueEntryCounter
   */
  entryID: number
  localKeys: {
    [x: string]: boolean
  }
  localCachedData: any
  syncCounter: number
  didSync: boolean
  syncKeys: any[]
  logstate: string // logging state
  requests: { [key: string]: import('../shardus/shardus-types').Node } // map of account keys to the node that we are requesting the account data from
  globalModification: boolean
  noConsensus: boolean // This means our queue entry does not need the consensus step. should only be used for initial network set commands
  uniqueKeys?: string[]
  ourNodeInvolved?: boolean
  transactionGroup?: import('../shardus/shardus-types').Node[]
  conensusGroup?: import('../shardus/shardus-types').Node[]
  approximateCycleAge?: number

  // Local preapply response
  preApplyTXResult?: PreApplyAcceptedTransactionResult // import("../shardus/shardus-types").ApplyResponse;

  // Consensus tracking:
  ourVote?: AppliedVote
  collectedVotes: AppliedVote[]
  // receipt that we created
  appliedReceipt?: AppliedReceipt

  // receipt that we got from gossip
  recievedAppliedReceipt?: AppliedReceipt
}

export type SyncTracker = {
  syncStarted: boolean
  syncFinished: boolean
  range: any
  cycle: number
  index: number
  queueEntries: QueueEntry[]

  isGlobalSyncTracker: boolean
  globalAddressMap: { [address: string]: boolean }
}

export type CycleShardData = {
  shardGlobals: any
  cycleNumber: number
  ourNode: import('../shardus/shardus-types').Node
  /**
   * our node's node shard data
   */
  nodeShardData: any
  nodeShardDataMap: Map<string, any>
  parititionShardDataMap: Map<number, any>
  activeNodes: import('../shardus/shardus-types').Node[]
  syncingNeighbors: import('../shardus/shardus-types').Node[]
  syncingNeighborsTxGroup: import('../shardus/shardus-types').Node[]
  hasSyncingNeighbors: boolean

  partitionsToSkip: Map<number, boolean>

  timestamp: number // timestamp for cleanup purposes, may not match exactly the rules of which transactions will live in a partition for this cycle.
  /**
   * hashlist index of the voters for this vote
   */
  voters: number[]
  /**
   * list of partitions that we do consensus on
   */
  ourConsensusPartitions?: number[]
  /**
   * list of stored parititions
   */
  ourStoredPartitions?: number[]
}
/**
 * a partition object
 */
export type RepairTracker = {
  triedHashes: string[]
  numNodes: number
  /**
   * cycle number for the repair obbject
   */
  counter: number
  /**
   * partition id for the repair object
   */
  partitionId: number
  /**
   * this key is based on the cycle counter in the form c###  where ### is the cycle number (can be as many digits as needed)
   */
  key: string
  /**
   * this key is based on the partition in the form p## where ## is the partition number (can be as many digits as needed)
   */
  key2: string
  removedTXIds: string[]
  repairedTXs: string[]
  newPendingTXs: import('../shardus/shardus-types').AcceptedTx[]
  newFailedTXs: import('../shardus/shardus-types').AcceptedTx[]
  extraTXIds: string[]
  missingTXIds: string[]
  repairing: boolean
  repairsNeeded: boolean
  busy: boolean
  /**
   * we have the TXs and TX data we need to apply data repairs
   */
  txRepairReady: boolean
  txRepairComplete: boolean
  evaluationStarted: boolean
  /**
   * not sure if we really need this
   */
  evaluationComplete: boolean
  awaitWinningHash: boolean
  repairsFullyComplete: boolean
  solutionDeltas?: SolutionDelta[]
  outputHashSet?: string
}
/**
 * a partition reciept
 */
export type PartitionReceipt = {
  resultsList: PartitionResult[]
  sign?: import('../shardus/shardus-types').Sign
}
/**
 * A simple address range
 */
export type SimpleRange = {
  /**
   * Starting index
   */
  low: string
  /**
   * End index
   */
  high: string
}
/**
 * a partition object
 */
export type PartitionObject = {
  Partition_id: number
  Partitions: number
  Cycle_number: number
  Txids: string[]
  Status: number[]
  States: string[]
  /**
   * todo more specific data export type
   */
  Chain: any[]
}
/**
 * a partition result
 */
export type PartitionResult = {
  Partition_id: number
  Partition_hash: string
  Cycle_number: number
  hashSet: string
  /**
   * // property {any} \[hashSetList\] this seems to be used as debug. considering commenting it out in solveHashSetsPrep for safety.
   */
  sign?: import('../shardus/shardus-types').Sign
}
/**
 * some generic data that represents a vote for hash set comparison
 */
export type GenericHashSetEntry = {
  hash: string
  votePower: number
  hashSet: string
  lastValue: string
  errorStack: HashSetEntryError[]
  corrections: HashSetEntryCorrection[]
  /**
     * {string[]} owners a list of owner addresses that have this solution
    {boolean} ourRow
     */
  indexOffset: number
  waitForIndex: number
  waitedForThis?: boolean
  /**
   * this gets added when you call expandIndexMapping. index map is our index to the solution output
   */
  indexMap?: number[]
  /**
   * this gets added when you call expandIndexMapping. extra map is the index in our list that is an extra
   */
  extraMap?: number[]
  futureIndex?: number
  futureValue?: string
  /**
   * current Pin index of this entry.. modified by solver.
   */
  pinIdx?: number
  /**
   * the object/vote we are pinned to.  todo make this a export type!!
   */
  pinObj?: any
  ownVotes?: any[]
}
/**
 * extends GenericHashSetEntry some generic data that represents a vote for hash set comparison
 */
export type IHashSetEntryPartitions = {
  /**
   * a list of owner addresses that have this solution
   */
  owners: string[]
  ourRow?: boolean
  outRow?: boolean
}
/**
 * newTXList, allAccountsToResetById, partitionId
 */
export type UpdateRepairData = {
  newTXList: import('../shardus/shardus-types').AcceptedTx[]
  allAccountsToResetById: {
    [x: string]: number
  }
  partitionId: number
  txIDToAcc: {
    [x: string]: {
      sourceKeys: string[]
      targetKeys: string[]
    }
  }
}
/**
 * an object to hold a temp tx record for processing later
 */
export type TempTxRecord = {
  txTS: number
  acceptedTx: import('../shardus/shardus-types').AcceptedTx
  passed: boolean
  applyResponse: import('../shardus/shardus-types').ApplyResponse
  /**
   * below 0 for not redacted. a value above zero indicates the cycle this was redacted
   */
  redacted: number

  isGlobalModifyingTX: boolean
  savedSomething: boolean
}
/**
 * an object that tracks our TXs that we are storing for later.
 */
export type TxTallyList = {
  hashes: string[]
  /**
   * AcceptedTx?
   */
  passed: number[]
  txs: any[]
  processed: boolean
  /**
   * below 0 for not redacted. a value above zero indicates the cycle this was redacted
   */
  states: any[]
  /**
   * this gets added on when we are reparing something newTxList seems to have a different format than existing types.
   */
  newTxList?: NewTXList
}

export type NewTXList = {
  hashes: string[]
  passed: number[]
  txs: any[]
  thashes: string[]
  tpassed: number[]
  ttxs: any[]
  tstates: any[]
  states: any[]
  processed: boolean
}

export type Cycle = import('../shardus/shardus-types').Cycle
export type Sign = import('../shardus/shardus-types').Sign
//export type Node = import("../shardus").Node;
export type AcceptedTx = import('../shardus/shardus-types').AcceptedTx
export type ApplyResponse = import('../shardus/shardus-types').ApplyResponse
// export type ShardGlobals = any;
// export type NodeShardData = any;
// export type ShardInfo = any;
// export type AddressRange = any;
// export type BasicAddressRange = any;
/**
 * a partition reciept that contains one copy of of the data and all of the signatures for that data
 */
export type CombinedPartitionReceipt = {
  /**
   * with signatures moved to a list
   */
  result: PartitionResult
  signatures: import('../shardus/shardus-types').Sign[]
}
/**
 * an object to hold a temp tx record for processing later
 */
export type SolutionDelta = {
  /**
   * index into our request list: requestsByHost.requests
   */
  i: number
  tx: import('../shardus/shardus-types').AcceptedTx
  pf: number // TSConversion was a boolean
  /**
   * a string snipped from our solution hash set
   */
  state: string
}
export type HashSetEntryPartitions = GenericHashSetEntry &
  IHashSetEntryPartitions
/**
 * some generic data that represents a vote for hash set comparison
 */
export type HashSetEntryCorrection = {
  /**
   * index
   */
  i: number
  /**
   * top vote index
   */
  tv: Vote
  /**
   * top vote value
   */
  v: string
  /**
   * export type 'insert', 'extra'
   */
  t: string
  /**
   * last value
   */
  bv: string
  /**
   * lat output count?
   */
  if: number
  /**
   * another index.
   */
  hi?: number
  /**
   * reference to the correction that this one is replacing/overriding
   */
  c?: HashSetEntryCorrection
}
/**
 * some generic data that represents a vote for hash set comparison
 */
export type HashSetEntryError = {
  /**
   * index
   */
  i: number
  /**
   * top vote index
   */
  tv: Vote
  /**
   * top vote value
   */
  v: string
}
/**
 * vote for a value
 */
export type Vote = {
  /**
   * vote value
   */
  v: string
  /**
   * number of votes
   */
  count: number
  /**
   * reference to another vote object
   */
  vote?: CountEntry
  /**
   * count based on vote power
   */
  ec?: number
  /**
   * hashlist index of the voters for this vote
   */
  voters?: number[]
}

export type StringVoteObjectMap = { [vote: string]: Vote }

export type ExtendedVote = Vote & {
  winIdx: number | null
  val: string
  lowestIndex: number
  voteTally: { i: number; p: number }[] // number[] // { i: index, p: hashListEntry.votePower }
  votesseen: any
  finalIdx: number
}

export type StringExtendedVoteObjectMap = { [vote: string]: ExtendedVote }

//{ winIdx: null, val: v, count: 0, ec: 0, lowestIndex: index, voters: [], voteTally: Array(hashSetList.length), votesseen }

/**
 * vote count tracking
 */
export type CountEntry = {
  /**
   * number of votes
   */
  count: number
  /**
   * count based on vote power
   */
  ec: number
  /**
   * hashlist index of the voters for this vote
   */
  voters: number[]
}

export type StringCountEntryObjectMap = { [vote: string]: CountEntry }

//let accountCopy = { accountId: accountEntry.accountId, data: accountEntry.data, timestamp: accountEntry.timestamp, hash: accountEntry.stateId, cycleNumber }
export type AccountCopy = {
  accountId: string
  data: any
  timestamp: number
  hash: string
  cycleNumber: number
  isGlobal: boolean
}

// AppliedVote
// The vote contains: [txid, [account_id], [account_state_hash_after], transaction_result, sign];

// where the
// result is the transaction result;
// the account_id array is sorted by account_id and
// the account_state_hash_after array is in corresponding order.
// The applied vote is sent even if the result is ‘fail’.

export type AppliedVoteCore = {
  txid: string
  transaction_result: boolean
  sign?: import('../shardus/shardus-types').Sign
}

// export type AppliedVote2 = {
//     coreVote: AppliedVoteCore;
//     account_id: string[];
//     account_state_hash_after: string[];
//     cant_apply: boolean; // indicates that the preapply could not give a pass or fail
//     sign?: import("../shardus/shardus-types").Sign
// };

export type AppliedVote = {
  txid: string
  transaction_result: boolean
  account_id: string[]
  account_state_hash_after: string[]
  cant_apply: boolean // indicates that the preapply could not give a pass or fail
  sign?: import('../shardus/shardus-types').Sign
}

// export type AppliedReceipt2 = {
//     vote: AppliedVoteCore;
//     signatures: import("../shardus/shardus-types").Sign[]
// };

//[txid, result, [applied_receipt]]
export type AppliedReceipt = {
  txid: string
  result: boolean
  appliedVotes: AppliedVote[]
}

// export type AppliedReceiptGossip2 = {
//     appliedReceipt: AppliedReceipt2
// };

//Transaction Related
export type TimeRangeandLimit = {
  tsStart: number
  tsEnd: number
  limit: number
}
export type AccountAddressAndTimeRange = {
  accountStart: string
  accountEnd: string
  tsStart: number
  tsEnd: number
}
export type AccountRangeAndLimit = {
  accountStart: string
  accountEnd: string
  maxRecords: number
}

export type AccountStateHashReq = AccountAddressAndTimeRange
export type AccountStateHashResp = { stateHash: string }

export type GossipAcceptedTxRecv = {
  acceptedTX: AcceptedTx
  sender: import('../shardus/shardus-types').Node
  tracker: string
}

export type GetAccountStateReq = AccountAddressAndTimeRange & {
  stateTableBucketSize: number
}

export type AcceptedTransactionsReq = TimeRangeandLimit
export type GetAccountDataReq = AccountRangeAndLimit

export type GetAccountData2Req = AccountAddressAndTimeRange & {
  maxRecords: number
}

export type GetAccountData3Req = {
  accountStart: string
  accountEnd: string
  tsStart: number
  maxRecords: number
}
export type GetAccountData3Resp = { data: GetAccountDataByRangeSmart }

export type PosPartitionResults = {
  partitionResults: PartitionResult[]
  Cycle_number: number
}

export type GetTransactionsByListReq = { Tx_ids: string[] }

export type TransactionsByPartitionReq = {
  cycle: number
  tx_indicies: any
  hash: string
  partitionId: number
  debugSnippets: any
}
export type TransactionsByPartitionResp = {
  success: boolean
  acceptedTX?: any
  passFail?: any[]
  statesList?: any[]
}

export type GetPartitionTxidsReq = { Partition_id: any; Cycle_number: string }

export type RouteToHomeNodeReq = {
  txid: any
  timestamp: any
  acceptedTx: import('../shardus/shardus-types').AcceptedTx
}

export type RequestStateForTxReq = {
  txid: string
  timestamp: number
  keys: any
}
export type RequestStateForTxResp = { stateList: any[]; note: string }

export type GetAccountDataWithQueueHintsResp = {
  accountData: import('../shardus/shardus-types').WrappedDataFromQueue[] | null
}

export type GlobalAccountReportResp = {
  combinedHash: string
  accounts: { id: string; hash: string; timestamp: number }[]
}

export type PreApplyAcceptedTransactionResult = {
  applied: boolean
  passed: boolean
  applyResult: string
  reason: string
  applyResponse?: import('../shardus/shardus-types').ApplyResponse
}

export type CommitConsensedTransactionResult = { success: boolean }

// Sync related
export type StateHashResult = { stateHash: string }

export type WrappedStates = {
  [accountID: string]: import('../shardus/shardus-types').WrappedData
}
export type WrappedStateArray = import('../shardus/shardus-types').WrappedData[]
//export type AccountFilter = {[accountID:string]:boolean}
export type AccountFilter = { [accountID: string]: number }
export type AccountBoolObjectMap = AccountFilter

export type WrappedResponses = {
  [accountID: string]: import('../shardus/shardus-types').WrappedResponse
}

export type SimpleDistanceObject = { distance: number }
export type StringNodeObjectMap = {
  [accountID: string]: import('../shardus/shardus-types').Node
}
export type AcceptedTxObjectById = {
  [txid: string]: import('../shardus/shardus-types').AcceptedTx
}
//localCachedData, applyResponse
export type TxObjectById = AcceptedTxObjectById

export type TxIDToKeyObjectMap = {
  [accountID: string]: import('../shardus/shardus-types').TransactionKeys
}
export type TxIDToSourceTargetObjectMap = {
  [accountID: string]: { sourceKeys: string[]; targetKeys: string[] }
}
//fifoLocks

//wrappedData.isPartial

export type DebugDumpPartitionAccount = { id: string; hash: string; v: string }
export type DebugDumpNodesCovered = {
  idx: number
  ipPort: string
  id: string
  fracID: number
  hP: number
  consensus: []
  stored: []
  extra: []
  numP: number
}
export type DebugDumpRangesCovered = {
  ipPort: string
  id: string
  fracID: number
  hP: number
  cMin: number
  cMax: number
  stMin: number
  stMax: number
  numP: number
}
export type DebugDumpPartition = {
  parititionID: number
  accounts: DebugDumpPartitionAccount[]
  skip: DebugDumpPartitionSkip
} // {[id:string]:string}
export type DebugDumpPartitionSkip = {
  p: number
  min: number
  max: number
  noSpread?: boolean
  inverted?: boolean
}
export type DebugDumpPartitions = {
  partitions: DebugDumpPartition[]
  cycle: number
  rangesCovered: DebugDumpRangesCovered
  nodesCovered: DebugDumpNodesCovered
  allNodeIds: string[]
  globalAccountIDs: string[]
  globalAccountSummary: any[]
  globalStateHash: string
}

//queue process related:
export type SeenAccounts = { [accountId: string]: QueueEntry | null }
export type LocalCachedData = { [accountId: string]: any }
//export type AllNewTXsById = {[accountId:string]: }
export type AccountValuesByKey = { [accountId: string]: any }

// repair related
export type StatusMap = { [txid: string]: number }
export type StateMap = { [txid: string]: string }
export type GetAccountDataByRangeSmart = {
  wrappedAccounts: WrappedStateArray
  lastUpdateNeeded: boolean
  wrappedAccounts2: WrappedStateArray
  highestTs: number
}

//generic relocate?
export type SignedObject = { sign: { owner: string } }
export type StringBoolObjectMap = { [key: string]: boolean }
export type StringNumberObjectMap = { [key: string]: number }
export type NumberStringObjectMap = { [index: number]: string }
export type StringStringObjectMap = { [key: string]: string }

export type FifoWaitingEntry = { id: number }
export type FifoLock = {
  fifoName: string
  queueCounter: number
  waitingList: FifoWaitingEntry[]
  lastServed: number
  queueLocked: boolean
  lockOwner: number
}
export type FifoLockObjectMap = { [lockID: string]: FifoLock }
