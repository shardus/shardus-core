import { Logger } from 'log4js'
import { P2P } from '@shardus/types'
import * as Comms from './Comms'
import * as Context from './Context'
import * as Self from './Self'
import { validateTypes } from '../utils'


/** STATE */

let p2pLogger: Logger

/** ROUTES */

const gossipRoute: P2P.P2PTypes.GossipHandler = (payload) => {}

const routes = {
  internal: {},
  gossip: {
    gossip: gossipRoute,
  },
}

/** FUNCTIONS */

/** CycleCreator Functions */

/* These functions must be defined by all modules that implement a
     network action like going active, lost node detection, etc.
     These functions are called by CycleCreator
*/

export function init() {
  // Init logger
  p2pLogger = Context.logger.getLogger('p2p')

  // Init state
  reset()

  // Register routes
  for (const [name, handler] of Object.entries(routes.internal)) {
    Comms.registerInternal(name, handler)
  }
  for (const [name, handler] of Object.entries(routes.gossip)) {
    Comms.registerGossipHandler(name, handler)
  }
}

export function reset() {}

export function getTxs(): P2P.SafetyModeTypes.Txs {
  return
}

export function dropInvalidTxs(txs: P2P.SafetyModeTypes.Txs): P2P.SafetyModeTypes.Txs {
  return
}

/*
Given the txs and prev cycle record mutate the referenced record
*/
export function updateRecord(
  txs: P2P.SafetyModeTypes.Txs,
  record: P2P.CycleCreatorTypes.CycleRecord,
  prev: P2P.CycleCreatorTypes.CycleRecord
) {
  // If you're the first node
  if (Self.isFirst) {
    // Get safety mode field values from snapshot
    Object.assign(record, { mode: 'forming' })
  }
  // If you're not the first node
  else {
    // Just copy the mode for now
    if (prev) {
      record.mode = prev.mode
    }
  }

  if (prev) {
    // set mode to recovery
    if (prev.mode !== 'forming' && enterRecovery(prev)) {
        if (prev.mode !== 'recovery') {
          record.mode = 'recovery'
        }
    // set mode to safety
    } else if (prev.mode !== 'forming' && enterSafety(prev)) {
        if (prev.mode !== 'safety') {
          record.mode = 'safety'
        }
    // set mode to processing
    } else if (enterProcessing(prev)) {
      if (prev.mode !== 'processing') {
        record.mode = 'processing'
      }
    }
  }
}

export function validateRecordTypes(rec: P2P.SafetyModeTypes.Record): string {
  let err = validateTypes(rec, { mode: 's' })
  if (err) return err
  return ''
}

export function parseRecord(record: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleParserTypes.Change {
  return {
    added: [],
    removed: [],
    updated: [],
  }
}


export function queueRequest(request) {}

export function sendRequests() {}

/** Helper Functions */

/* These functions make the code neater and easier to understand
*/

function enterRecovery(prev: P2P.CycleCreatorTypes.CycleRecord): Boolean {
  return prev.active < (0.5 * Context.config.p2p.minNodes)
}

function enterSafety(prev: P2P.CycleCreatorTypes.CycleRecord): Boolean {
  return prev.active < (0.9 * Context.config.p2p.minNodes)
}

function enterProcessing(prev: P2P.CycleCreatorTypes.CycleRecord): Boolean {
  let enterProcessing = false
  /* 
  In the future the change from recovery to processing will need to be updated in the recovery project.
  per Andrew, we may want a sticky state that doesn't enter processing until something indicates the data is restored,
  and we may even want the nodes to get to minnodes count before the archivers start patching data
  */
  if (prev.mode === 'recovery') {
    enterProcessing = prev.active >= Context.config.p2p.minNodes
  } else {
    enterProcessing = prev.active >= 0.9 * Context.config.p2p.minNodes
  }
  return enterProcessing
}
