/**
  * `v2` houses some new state or functions introduced with Join Protocol v2.
  * TODO: Rename this module later?
  */

import { hexstring } from "@shardus/types";
import { JoinRequest, StandbyInfo } from "@shardus/types/build/src/p2p/JoinTypes";
import { config, crypto } from '../../Context'
import * as CycleChain from '../../CycleChain'
import * as Self from '../../Self'
import rfdc from 'rfdc'
import { executeNodeSelection, notifyNewestJoinedConsensors } from "./select";
import { SignedObject } from "@shardus/types/build/src/p2p/P2PTypes";
import { err, ok, Result } from "neverthrow";

const clone = rfdc()

/** Just a local convenience type. */
type publickey = StandbyInfo['nodeInfo']['publicKey']

/**
  * A request to leave the network's standby node list.
  */
export type UnjoinRequest = SignedObject<{
  publicKey: hexstring
}>

/** The list of nodes that are currently on standby. */
const standbyNodesInfo: Map<publickey, StandbyInfo> = new Map()

/**
  * New join requests received during the node's current cycle. This list is
  * "drained" when the cycle is digested. Its entries are added to `standbyNodeList` as part of cycle...
  * digestion. appetizing!
  */
let newStandbyInfos: StandbyInfo[] = []

export function init(): void {
  console.log('initializing join protocol v2')

  // set up event listeners for cycle quarters
  Self.emitter.on('cycle_q1_start', () => {
    if (config.p2p.useJoinProtocolV2) {
      notifyNewestJoinedConsensors().catch((e) => {
        console.error('failed to notify selected nodes:', e)
      })
    }
  });
  Self.emitter.on('cycle_q2_start', () => {
    if (config.p2p.useJoinProtocolV2)
      executeNodeSelection()
  });
}

/**
  * Pushes the join request onto the list of new join requests. Its node's info
  * will be added to the standby node list at the end of the cycle during cycle
  * digestion.
  */
export function saveJoinRequest(joinRequest: JoinRequest): void {
  const standbyAdditionInfo = {
    nodeInfo: joinRequest.nodeInfo,
    publicKey: joinRequest.nodeInfo.publicKey,
    selectionNum: joinRequest.selectionNum,
  }
  console.log('saving join request:', joinRequest)

  // if first node, add to standby list immediately
  if (Self.isFirst) {
    standbyNodesInfo.set(standbyAdditionInfo.publicKey, standbyAdditionInfo)
    return
  }
  newStandbyInfos.push(standbyAdditionInfo)
}

/**
  * Returns the list of new standby info and empties the list.
  */
export function drainNewStandbyInfo(): StandbyInfo[] {
  console.log('draining new standby info:', newStandbyInfos)
  const tmp = newStandbyInfos
  newStandbyInfos = []
  return tmp
}

/**
  * Adds nodes to the standby node list.
  */
export function addStandbyNodes(...nodes: StandbyInfo[]): void {
  console.log('adding standby nodes:', nodes)
  for (const node of nodes) {
    standbyNodesInfo.set(node.nodeInfo.publicKey, node)
  }
}

let lastHashedList: StandbyInfo[] = []

/**
  * Returns the list of standby nodes, sorted by their public keys.
  */
export function getSortedStandbyNodeList(): StandbyInfo[] {
  console.log('getting sorted standby node list')
  return [...standbyNodesInfo.values()].sort((a, b) =>
    // using mathematical comparison in case localeCompare is inconsistent.
    // we will use a simple ternary statement for this that doens't account for
    // equality. this should be fine as no two public keys should be the same.
    a.nodeInfo.publicKey > b.nodeInfo.publicKey ? 1 : -1
  )
}

/** Calculates and returns a hash based on the list of standby nodes, sorted by public key. This will also update the recorded `lastHashedList` of nodes, which can be retrieved via `getLastHashedStandbyList`. */
export function computeNewStandbyListHash(): hexstring {
  console.log('computing new standby list hash')
  // set the lastHashedList to the current list by pubkey, then hash.
  // deep cloning is necessary as standby node information may be mutated by
  // reference.
  lastHashedList = clone(getSortedStandbyNodeList())
  const hash = crypto.hash(lastHashedList)
  return hash
}

/**
 * Returns the standby node list hash from the last complete cycle, if available. If you
 * want to compute a new hash instead, use `computeNewStandbyListHash`.
 */
export function getStandbyListHash(): hexstring | undefined {
  console.log('getting standby list hash')
  return CycleChain.newest?.standbyNodeListHash
}

/** Returns the last list of standby information that had its hash computed. */
export function getLastHashedStandbyList(): StandbyInfo[] {
  console.log('getting last hashed standby list')
  return lastHashedList
}

/** Returns the map of standby information. */
export function getStandbyNodesInfoMap(): Map<publickey, StandbyInfo> {
  console.log('getting standby nodes info map')
  return standbyNodesInfo
}

/**
  * Submits a request to leave the network's standby node list.
  */
export async function submitUnjoin(activeNodes: P2P.P2PTypes.Node[]): Promise<Result<void, Error>> {
  // TODO
}

/** 
  * Deletes standby nodes and join requests associated with the unjoin request
  * if the unjoin request is valid.
  */
export function processUnjoinRequest(unjoinRequest: UnjoinRequest): Result<void, Error> {
  return validateUnjoinRequest(unjoinRequest).map(() => {
    // TODO remove join request and standby node info
  })
}

/**
  * Validates an unjoin request by its signature.
  */
export function validateUnjoinRequest(unjoinRequest: UnjoinRequest): Result<void, Error> {
  if (crypto.verify(unjoinRequest, unjoinRequest.publicKey)) {
    return ok(void 0)
  } else {
    return err(new Error('unjoin request signature is invalid'))
  }
}
