/**
  * `v2` houses some new state or functions introduced with Join Protocol v2.
  * TODO: Rename this module later?
  */

import { P2P } from "@shardus/types";
import { JoinRequest, StandbyAdditionInfo } from "@shardus/types/build/src/p2p/JoinTypes";

/** The list of nodes that are currently on standby. */
const standbyNodesInfo: Map<StandbyAdditionInfo['publicKey'], StandbyAdditionInfo> = new Map()

/**
  * New join requests received during the node's current cycle. This list is
  * "flushed" when the cycle is digested. Its entries are added to `standbyNodeList` as part of cycle...
  * digestion. appetizing!
  */
let newJoinRequests: JoinRequest[] = []

/**
  * All join requests that have been received from other nodes.
  */
const allJoinRequests: Map<P2P.P2PTypes.Node['publicKey'], JoinRequest[]> = new Map()

/**
  * Pushes the join request onto the list of new join requests. Its node's info
  * will be added to the standby node list at the end of the cycle during cycle
  * digestion.
  */
export function saveJoinRequest(joinRequest: JoinRequest): void {
  newJoinRequests.push(joinRequest)
  allJoinRequests.set(joinRequest.nodeInfo.publicKey, newJoinRequests)
}

export function getNewJoinRequests(): JoinRequest[] {
  return newJoinRequests
}

export function clearNewJoinRequests(): void {
  newJoinRequests = []
}

/**
  * Adds nodes to the standby node list.
  */
export function addStandbyNodes(...nodes: StandbyAdditionInfo[]): void {
  for (const node of nodes) {
    standbyNodesInfo.set(node.publicKey, node)
  }
}
