import { NETWORK_CONFIG_HASH_PATTERN } from '../../config/networkConfigConstants'

export type NetworkConfigJoinResponseCode =
  | 'NETWORK_CONFIG_FIELDS_REQUIRED'
  | 'NETWORK_CONFIG_CYCLE_UNAVAILABLE'
  | 'NETWORK_CONFIG_CYCLE_EXPIRED'
  | 'NETWORK_CONFIG_CYCLE_IN_FUTURE'
  | 'NETWORK_CONFIG_HASH_MISMATCH'

export interface NetworkConfigJoinFields {
  networkConfigHash?: string
  networkConfigCycleMarker?: string
}

export interface NetworkConfigJoinValidationResponse {
  success: false
  fatal: false
  reason: string
  code: NetworkConfigJoinResponseCode
  expectedNetworkConfigHash?: string
}

export interface NetworkConfigCycleReference {
  counter?: number
  networkConfigHash?: string
}

export interface NetworkConfigJoinValidationResult {
  diagnostic: NetworkConfigJoinResponseCode | null
  response: NetworkConfigJoinValidationResponse | null
}

export const DEFAULT_MAX_NETWORK_CONFIG_REFERENCE_AGE = 5
const HASH_PATTERN = new RegExp(NETWORK_CONFIG_HASH_PATTERN)

function rejection(
  code: NetworkConfigJoinResponseCode,
  reason: string,
  enforcement: boolean,
  expectedNetworkConfigHash?: string
): NetworkConfigJoinValidationResult {
  const response: NetworkConfigJoinValidationResponse = {
    success: false,
    fatal: false,
    code,
    reason,
    expectedNetworkConfigHash,
  }
  if (!expectedNetworkConfigHash) delete response.expectedNetworkConfigHash
  return { diagnostic: response.code, response: enforcement ? response : null }
}

/** Pure validator so direct and gossiped join paths use exactly the same decision. */
export function evaluateNetworkConfigJoin(
  request: NetworkConfigJoinFields,
  enforcement: boolean,
  cyclesByMarker: Record<string, NetworkConfigCycleReference>,
  currentCounter?: number,
  maxReferenceAge = DEFAULT_MAX_NETWORK_CONFIG_REFERENCE_AGE
): NetworkConfigJoinValidationResult {
  if (
    typeof request.networkConfigHash !== 'string' ||
    !HASH_PATTERN.test(request.networkConfigHash) ||
    typeof request.networkConfigCycleMarker !== 'string' ||
    !HASH_PATTERN.test(request.networkConfigCycleMarker)
  ) {
    return rejection(
      'NETWORK_CONFIG_FIELDS_REQUIRED',
      'Network configuration hash and cycle marker are required',
      enforcement
    )
  }

  const cycle = cyclesByMarker[request.networkConfigCycleMarker]
  if (!cycle) {
    return rejection(
      'NETWORK_CONFIG_CYCLE_UNAVAILABLE',
      'The referenced network configuration cycle is unavailable',
      enforcement
    )
  }

  if (typeof currentCounter === 'number' && typeof cycle.counter === 'number') {
    const age = currentCounter - cycle.counter
    if (age < 0) {
      return rejection(
        'NETWORK_CONFIG_CYCLE_IN_FUTURE',
        'The referenced network configuration cycle is in the future',
        enforcement
      )
    }
    if (age > maxReferenceAge) {
      return rejection(
        'NETWORK_CONFIG_CYCLE_EXPIRED',
        'The referenced network configuration cycle is too old',
        enforcement
      )
    }
  }

  if (cycle.networkConfigHash !== request.networkConfigHash) {
    return rejection(
      'NETWORK_CONFIG_HASH_MISMATCH',
      'The submitted network configuration hash does not match the referenced cycle',
      enforcement,
      cycle.networkConfigHash
    )
  }
  return { diagnostic: null, response: null }
}

/** Tracks bounded majority rejections without treating validator-provided hashes as authority. */
export class NetworkConfigMismatchTracker {
  private hash: string | null = null
  private count = 0

  record(hash: string): number {
    if (hash === this.hash) this.count++
    else {
      this.hash = hash
      this.count = 1
    }
    return this.count
  }

  reset(): void {
    this.hash = null
    this.count = 0
  }
}

export function hasNetworkConfigMismatchMajority(
  selectedNodeCount: number,
  responses: Array<{ code?: string } | null | undefined>
): boolean {
  const mismatches = responses.filter((response) => response?.code === 'NETWORK_CONFIG_HASH_MISMATCH').length
  return mismatches >= Math.floor(selectedNodeCount / 2) + 1
}
