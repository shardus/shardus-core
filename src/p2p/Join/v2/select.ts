/**
  * This module contains the logic for selecting the nodes that will be allowed
  * to join the network.
  */

import { crypto } from "../../Context";
import * as Self from "../../Self";
import * as CycleChain from "../../CycleChain";
import * as http from '../../../http'

import { getAllJoinRequestsMap, getStandbyNodesInfoMap } from ".";
import { calculateToAccept, computeSelectionNum } from "..";

const selectedPublicKeys: Set<string> = new Set();

/**
  * Decides how many nodes to accept into the network, then selects nodes that
  * will be allowed to join. If this node isn't active yet, selection will be
  * skipped.
  */
export function executeNodeSelection(): void {
  if (!Self.isActive) {
    console.warn('not selecting nodes because we are not active yet')
    return
  }

  const numToAccept = calculateToAccept()
  console.log(`selecting ${numToAccept} nodes to accept`)
  selectNodes(numToAccept)
}

/**
  * Selects the nodes to be allowed to join. 
  * Iterates through all standby nodes and pick the best ones by their scores
  * (`selectionNum`)
  *
  * @returns The list of public keys of the nodes that have been selected.
  */
export function selectNodes(maxAllowed: number): void {
  const standbyNodesInfo = getStandbyNodesInfoMap()
  const joinRequests = getAllJoinRequestsMap()
  console.log("selecting from standbyNodesInfo", standbyNodesInfo)
  console.log("selecting from joinRequests", joinRequests)

  // construct a list of objects that we'll sort by `selectionNum`. we'll use
  // the public key to get the join request associated with the public key and
  // inform the node later that it has been accepted
  const objs: { publicKey: string, selectionNum: string }[] = []
  for (const publicKey of standbyNodesInfo.keys()) {
    const joinRequest = joinRequests.get(publicKey)

    console.log("computing selection number for", publicKey)
    const selectionNumResult = computeSelectionNum(joinRequest)
    if (selectionNumResult.isErr()) {
      console.error(`failed to compute selection number for node ${publicKey}:`, JSON.stringify(selectionNumResult.error))
      continue
    }
    objs.push({ publicKey, selectionNum: selectionNumResult.value })
  }

  // sort the objects by their selection numbers
  objs.sort((a, b) =>
    a.selectionNum < b.selectionNum ? 1 : a.selectionNum > b.selectionNum ? -1 : 0)

  // add as many keys as we're allowed to the set
  while (selectedPublicKeys.size < maxAllowed && objs.length > 0)
    selectedPublicKeys.add(objs.splice(0, 1)[0].publicKey)
}

/**
  * Notifies the nodes that have been selected that they have been selected by
  * calling their `accepted` endpoints.`
  */
export async function notifyNewestJoinedConsensors(): Promise<void> {
  const marker = CycleChain.getCurrentCycleMarker()
  for (const joinedConsensor of CycleChain.newest.joinedConsensors) {
    const publicKey = joinedConsensor.publicKey

    // no need to notify ourselves
    if (publicKey === crypto.keypair.publicKey) continue
    console.log('notifying node', publicKey, 'that it has been selected')

    // make the call, but don't await. it might take a while.
    http.get(`http://${joinedConsensor.externalIp}:${joinedConsensor.externalPort}/accepted/${marker}`).catch(e => {
      console.error(`failed to notify node ${publicKey} that it has been selected:`, e)
    })
  }
}

/**
  * Returns the list of public keys of the nodes that have been selected and
  * empties the list.
  */
export function drainSelectedPublicKeys(): string[] {
  const tmp = [...selectedPublicKeys.values()]
  selectedPublicKeys.clear()
  return tmp
}

export function forceSelectSelf(): void {
  selectedPublicKeys.add(crypto.keypair.publicKey)
}
