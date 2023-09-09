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
