import { EventEmitter } from 'events'
import Log4js from 'log4js'

import Crypto from '../crypto'
import Logger, { logFlags } from '../logger'
import Shardus from '../shardus/shardus-types'
import Storage from '../storage'
import * as utils from '../utils'
import Profiler from '../utils/profiler'

type P2P = typeof import('../p2p')

interface Consensus {
  profiler: Profiler
  app: Shardus.App
  config: Shardus.ShardusConfiguration
  logger: Logger
  mainLogger: Log4js.Logger
  fatalLogger: Log4js.Logger
  crypto: Crypto
  p2p: P2P
  storage: Storage
  pendingTransactions: any
  lastServed: number
}

class Consensus extends EventEmitter {
  constructor(
    app: Shardus.App,
    config: Shardus.ShardusConfiguration,
    logger: Logger,
    crypto: Crypto,
    storage: Storage,
    profiler: Profiler
  ) {
    super()
    this.profiler = profiler
    this.app = app
    this.config = config
    this.logger = logger
    this.mainLogger = this.logger.getLogger('main')
    this.fatalLogger = this.logger.getLogger('fatal')
    this.crypto = crypto
    this.storage = storage

    this.pendingTransactions = {}

    this.lastServed = 0
  }

  async inject(shardusTransaction, global, noConsensus) {
    const debugToMainLogger = (message) => {
      if (logFlags.debug) this.mainLogger.debug(message)
    }

    let transactionReceipt
    const inTransaction = shardusTransaction.inTransaction
    let timestamp = 0
    let debugInfo = ''
    try {
      const keysResponse = this.app.getKeyFromTransaction(inTransaction)
      const { sourceKeys, targetKeys } = keysResponse
      timestamp = keysResponse.timestamp
      debugInfo = keysResponse.debugInfo

      debugToMainLogger(
        `Start of inject(globalModification:${global}  ts: ${timestamp} noConsensus:${noConsensus} dbg: ${debugInfo}  tx: ${utils.stringifyReduce(
          shardusTransaction
        )})`
      )

      let sourceAddress, targetAddress, stateId, targetStateId

      if (Array.isArray(sourceKeys) && sourceKeys.length > 0) {
        sourceAddress = sourceKeys[0]
      }
      if (Array.isArray(targetKeys) && targetKeys.length > 0) {
        targetAddress = targetKeys[0]
      }

      debugToMainLogger(
        `sourceAddress: ${utils.makeShortHash(
          sourceAddress
        )} targetAddress: ${utils.makeShortHash(targetAddress)}`
      )

      if (sourceAddress) {
        debugToMainLogger(`get source state id for ${sourceAddress}`)
        stateId = null // await this.app.getStateId(sourceAddress)
        debugToMainLogger(
          `StateID: ${stateId} short stateID: ${utils.makeShortHash(stateId)} `
        )
      }

      if (targetAddress) {
        debugToMainLogger(`get target state id for ${targetAddress}`)
        targetStateId = null // await this.app.getStateId(targetAddress, false) // we don't require this to exist
        debugToMainLogger(`targetStateId ${targetStateId}`)
      }

      if (sourceAddress === null && targetAddress === null) {
        throw new Error(
          `app.getKeyFromTransaction did not return any keys for the transaction: ${utils.stringifyReduce(
            shardusTransaction
          )}`
        )
      }

      debugToMainLogger(
        `Creating the receipt for the transaction: StateID: ${stateId} short stateID: ${utils.makeShortHash(
          stateId
        )} `
      )

      transactionReceipt = this.createReceipt(
        inTransaction,
        stateId,
        targetStateId
      )
      debugToMainLogger(
        `Done Creating the receipt for the transaction: StateID: ${stateId} short stateID: ${utils.makeShortHash(
          stateId
        )} `
      )
    } catch (ex) {
      this.logger
        .getLogger('main')
        .error(`Inject: Failed to process Transaction. Exception: ${ex}`)
      this.fatalLogger.fatal(
        'inject: ' + ex.name + ': ' + ex.message + ' at ' + ex.stack
      )
      this.logger.playbackLogNote(
        'tx_consensus_rejected',
        `${this.crypto.hash(inTransaction)}`,
        `Transaction: ${utils.stringifyReduce(inTransaction)}`
      )
      throw new Error(ex)
    }

    const txStatus = 1 // todo real values for tx status. this is just a stand in
    const txId = transactionReceipt.txHash
    const acceptedTX = {
      id: txId,
      timestamp,
      data: inTransaction,
      status: txStatus,
      receipt: transactionReceipt,
    }

    this.emit(
      'accepted',
      acceptedTX,
      /*send gossip*/ true,
      null,
      global,
      noConsensus
    )
    this.logger.playbackLogNote(
      'tx_accepted',
      `TransactionId: ${txId}`,
      `AcceptedTransaction: ${utils.stringifyReduce(acceptedTX)}`
    )

    if (logFlags.debug) {
      this.mainLogger.debug(
        `End of inject(${timestamp}  debugInfo: ${debugInfo})`
      )
    }

    return transactionReceipt
  }

  createReceipt(tx, state, targetStateId) {
    let receipt = {
      stateId: state,
      targetStateId,
      txHash: this.crypto.hash(tx),
      time: Date.now(),
    }
    receipt = this.crypto.sign(receipt) // sign with this node's key
    return receipt
  }
}

export default Consensus
