import { SignedObject } from "@shardus/types/build/src/p2p/P2PTypes";
import { crypto } from '../../Context'
import { err, ok, Result } from "neverthrow";
import { hexstring, P2P } from "@shardus/types";

/**
  * A request to leave the network's standby node list.
  */
export type UnjoinRequest = SignedObject<{
  publicKey: hexstring
}>

/**
  * Submits a request to leave the network's standby node list.
  */
export async function submitUnjoin(activeNodes: P2P.P2PTypes.Node[]): Promise<Result<void, Error>> {
  // TODO
}

/**
  * Process a new unjoin request, adding it to the set of new unjoin requests
  * that will be recorded in the next cycle.
  *
  * Returns with an error if the unjoin request is invalid.
  */
export function processNewUnjoinRequest(unjoinRequest: UnjoinRequest): Result<void, Error> {
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
