import { SignedObject } from "@shardus/types/build/src/p2p/P2PTypes";
import { crypto } from '../../Context'
import { err, ok, Result } from "neverthrow";
import { hexstring } from "@shardus/types";
import * as utils from '../../../utils'
import * as http from '../../../http'
import * as NodeList from '../../NodeList'
import { getProvidedActiveNodes, getStandbyNodesInfoMap } from ".";

/**
  * A request to leave the network's standby node list.
  */
export type UnjoinRequest = SignedObject<{
  publicKey: hexstring
}>

/** A Set of new public keys of nodes that have submitted unjoin requests. */
const newUnjoinRequests: Set<hexstring> = new Set()

/**
  * Submits a request to leave the network's standby node list.
  */
export async function submitUnjoin(): Promise<Result<void, Error>> {
  const unjoinRequest = crypto.sign({
    publicKey: crypto.keypair.publicKey
  })

  const activeNodes = getProvidedActiveNodes()

  // send the unjoin request to a handful of the active node all at once
  const selectedNodes = utils.getRandom(activeNodes, Math.min(activeNodes.length, 5))

  // gather up the promises pertaining to sending the unjoin request
  const promises = []
  for (const node of selectedNodes) {
    try {
      promises.push(http.post(`${node.externalIp}:${node.externalPort}/unjoin`, unjoinRequest))
    } catch (err) {
      return err(new Error(
        `Fatal: submitUnjoin: Error posting unjoin request to ${node.externalIp}:${node.externalPort}: ${err}`
      ))
    }
  }

  try {
    const responses = await Promise.all(promises)

    for (const res of responses) {
      if (res.fatal) {
        return err(new Error(`Fatal: Fatal unjoin request with reason: ${res.reason}`))
      }
    }
  } catch (e) {
    return err(new Error(`submitUnjoin: Error posting unjoin request: ${e}`))
  }
}

/**
  * Process a new unjoin request, adding it to the set of new unjoin requests
  * that will be recorded in the next cycle.
  *
  * Returns with an error if the unjoin request is invalid.
  */
export function processNewUnjoinRequest(unjoinRequest: UnjoinRequest): Result<void, Error> {
  console.log("processing unjoin request for", unjoinRequest.publicKey)

  // validate the unjoin request and then add it if it is valid
  return validateUnjoinRequest(unjoinRequest).map(() => {
    newUnjoinRequests.add(unjoinRequest.publicKey)
  })
}

/**
  * Validates an unjoin request by its signature.
  */
export function validateUnjoinRequest(unjoinRequest: UnjoinRequest): Result<void, Error> {
  // ignore if the unjoin request already exists
  if (newUnjoinRequests.has(unjoinRequest.publicKey)) {
    return err(new Error(`unjoin request from ${unjoinRequest.publicKey} already exists`))
  }

  // ignore if the unjoin request is from a node that is not in standby
  const foundInStandbyNodes = getStandbyNodesInfoMap().has(unjoinRequest.publicKey)
  if (!foundInStandbyNodes) {
    return err(new Error(`unjoin request from ${unjoinRequest.publicKey} is from a node not in standby`))
  }

  // ignore if the unjoin request is from a node that is active
  const foundInActiveNodes = NodeList.byPubKey.has(unjoinRequest.publicKey)
  if (foundInActiveNodes) {
    return err(new Error(`unjoin request from ${unjoinRequest.publicKey} is from an active node that can't unjoin`))
  }

  // lastly, verify the signature of the join request
  if (!crypto.verify(unjoinRequest, unjoinRequest.publicKey)) {
    return err(new Error('unjoin request signature is invalid'))
  }

  return ok(void 0)
}

export function drainNewUnjoinRequests(): hexstring[] {
  const drained = [...newUnjoinRequests.values()]
  newUnjoinRequests.clear()
  return drained
}

export function deleteStandbyNode(publicKey: hexstring): void {
  getStandbyNodesInfoMap().delete(publicKey)
}
