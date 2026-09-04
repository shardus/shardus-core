export type NetworkConfigJoinResponseCode =
  | 'NETWORK_CONFIG_FIELDS_REQUIRED'
  | 'NETWORK_CONFIG_CYCLE_UNAVAILABLE'
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

export interface NetworkConfigJoinValidationResult {
  diagnostic: NetworkConfigJoinResponseCode | null
  response: NetworkConfigJoinValidationResponse | null
}

const HASH_PATTERN = /^[a-fA-F0-9]{64}$/

/** Pure validator so direct and gossiped join paths use exactly the same decision. */
export function evaluateNetworkConfigJoin(
  request: NetworkConfigJoinFields,
  enforcement: boolean,
  cyclesByMarker: Record<string, { networkConfigHash?: string }>
): NetworkConfigJoinValidationResult {
  if (
    typeof request.networkConfigHash !== 'string' ||
    !HASH_PATTERN.test(request.networkConfigHash) ||
    typeof request.networkConfigCycleMarker !== 'string' ||
    !HASH_PATTERN.test(request.networkConfigCycleMarker)
  ) {
    const response: NetworkConfigJoinValidationResponse = {
      success: false,
      fatal: false,
      code: 'NETWORK_CONFIG_FIELDS_REQUIRED',
      reason: 'Network configuration hash and cycle marker are required',
    }
    return { diagnostic: response.code, response: enforcement ? response : null }
  }

  const cycle = cyclesByMarker[request.networkConfigCycleMarker]
  if (!cycle) {
    const response: NetworkConfigJoinValidationResponse = {
      success: false,
      fatal: false,
      code: 'NETWORK_CONFIG_CYCLE_UNAVAILABLE',
      reason: 'The referenced network configuration cycle is unavailable',
    }
    return { diagnostic: response.code, response: enforcement ? response : null }
  }

  if (cycle.networkConfigHash !== request.networkConfigHash) {
    const response: NetworkConfigJoinValidationResponse = {
      success: false,
      fatal: false,
      code: 'NETWORK_CONFIG_HASH_MISMATCH',
      reason: 'The submitted network configuration hash does not match the referenced cycle',
      expectedNetworkConfigHash: cycle.networkConfigHash,
    }
    return { diagnostic: response.code, response: enforcement ? response : null }
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
