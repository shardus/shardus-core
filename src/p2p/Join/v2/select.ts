/**
  * This module contains the logic for selecting the nodes that will be allowed
  * to join the network.
  */

import { getAllJoinRequestsMap, getStandbyNodesInfoMap } from ".";
import { calculateToAccept, computeSelectionNum } from "..";

let selectedPublicKeys: string[] = [];

export function executeNodeSelection(): void {
  const numToAccept = calculateToAccept()
  selectedPublicKeys = selectNodes(numToAccept)
}

/**
  * Selects the nodes to be allowed to join. 
  * Iterates through all standby nodes and pick the best ones by their scores
  * (`selectionNum`)
  *
  * @returns The list of public keys of the nodes that have been selected.
  */
export function selectNodes(maxAllowed: number): string[] {
  const standbyNodesInfo = getStandbyNodesInfoMap()
  const joinRequests = getAllJoinRequestsMap()

  // construct a list of objects that we'll sort by `selectionNum`. we'll use
  // the public key to get the join request associated with the public key and
  // inform the node later that it has been accepted
  const objs = []
  for (const publicKey of standbyNodesInfo.keys()) {
    const joinRequest = joinRequests.get(publicKey)
    const selectionNum = computeSelectionNum(joinRequest, publicKey)
    objs.push({ publicKey, selectionNum })
  }

  // sort the objects by their selection numbers
  objs.sort((a, b) =>
    a.selectionNum < b.selectionNum ? 1 : a.selectionNum > b.selectionNum ? -1 : 0)

  // remove any excess nodes if we are over the allowed limit
  if (objs.length > maxAllowed) {
    const excess = objs.length - maxAllowed
    objs.splice(-excess)
  }

  return objs
}

/**
  * Returns the list of public keys of the nodes that have been selected and
  * empties the list.
  */
export function drainSelectedPublicKeys(): string[] {
  const tmp = selectedPublicKeys
  selectedPublicKeys = []
  return tmp
}
