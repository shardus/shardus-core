import { P2P } from '@shardus/lib-types'
import * as http from '../http'
import { StrictServerConfiguration } from '../shardus/shardus-types'
import {
  AppliedNetworkConfig,
  applyNetworkConfig,
  hashNetworkConfig,
  hashNetworkConfigPayload,
  setAppliedNetworkConfig,
  validateNetworkConfig,
} from './networkConfig'
import { robustQueryForCycleRecordHash, getCycleDataFromNode } from '../p2p/SyncV2/queries'
import { verifyPayload } from '../types/ajv/Helpers'
import { AJVSchemaEnum } from '../types/enum/AJVSchemaEnum'

type ActiveNode = Partial<P2P.SyncTypes.ActiveNode> & Partial<P2P.NodeListTypes.Node>
type NetConfigResponse = { config: unknown; networkConfigHash: string }
type CycleMarkerQueryResult = { marker: string; winningNodes: ActiveNode[] }

function validateCycleRecord(cycle: P2P.CycleCreatorTypes.CycleRecord): void {
  if (!cycle || typeof cycle !== 'object') throw new Error('cycle record is empty or malformed')
  if (typeof cycle.counter !== 'number') throw new Error('cycle record counter is missing or malformed')
  if (typeof cycle.networkConfigHash !== 'string') {
    throw new Error('cycle record networkConfigHash is missing or malformed')
  }
  try {
    const cycleErrors = verifyPayload(AJVSchemaEnum.CycleRecords, [cycle])
    if (cycleErrors && cycleErrors.length > 0) {
      throw new Error(`cycle record schema validation failed: ${cycleErrors.join('; ')}`)
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('error missing schema')) return
    throw error
  }
}

export interface NetworkConfigBootstrapDependencies {
  queryCycleMarker?: (nodes: ActiveNode[]) => Promise<CycleMarkerQueryResult>
  fetchCycleByMarker?: (node: ActiveNode, marker: string) => Promise<P2P.CycleCreatorTypes.CycleRecord>
  makeCycleMarker(cycle: P2P.CycleCreatorTypes.CycleRecord): string
  get?: (url: string) => Promise<NetConfigResponse>
  shuffle?: (nodes: ActiveNode[]) => ActiveNode[]
  hash?: (config: StrictServerConfiguration) => string
  payloadHash?: (payload: unknown) => string
}

/** Fetch, validate, apply, and re-verify the configuration committed to by an accepted cycle. */
export async function adoptNetworkConfig(
  target: StrictServerConfiguration,
  activeNodes: ActiveNode[],
  dependencies: NetworkConfigBootstrapDependencies,
  attempts = 3
): Promise<AppliedNetworkConfig> {
  const get = dependencies.get ?? ((url: string) => http.get(url) as Promise<NetConfigResponse>)
  const hash = dependencies.hash ?? hashNetworkConfig
  const payloadHash = dependencies.payloadHash ?? hashNetworkConfigPayload
  const queryCycleMarker =
    dependencies.queryCycleMarker ??
    (async (nodes: ActiveNode[]): Promise<CycleMarkerQueryResult> => {
      const result = await robustQueryForCycleRecordHash(nodes as P2P.SyncTypes.ActiveNode[])
      if (result.isErr()) throw result.error
      return {
        marker: result.value.value.currentCycleHash,
        winningNodes: result.value.winningNodes,
      }
    })
  const fetchCycleByMarker =
    dependencies.fetchCycleByMarker ??
    (async (node: ActiveNode, marker: string): Promise<P2P.CycleCreatorTypes.CycleRecord> => {
      const result = await getCycleDataFromNode(node as P2P.SyncTypes.ActiveNode, marker)
      if (result.isErr()) throw result.error
      return result.value
    })
  let lastError: Error = new Error('No active node supplied a network configuration')

  for (let attempt = 0; attempt < attempts; attempt++) {
    let cycle: P2P.CycleCreatorTypes.CycleRecord
    let agreedMarker: string
    let markerNodes: ActiveNode[]
    try {
      const markerResult = await queryCycleMarker(activeNodes)
      agreedMarker = markerResult.marker
      markerNodes = markerResult.winningNodes
      if (!agreedMarker || !Array.isArray(markerNodes) || markerNodes.length === 0) {
        throw new Error('no robust cycle marker agreement')
      }
      cycle = await fetchCycleByMarker(markerNodes[0], agreedMarker)
      const actualMarker = dependencies.makeCycleMarker(cycle)
      if (actualMarker !== agreedMarker) {
        throw new Error(`cycle marker mismatch: expected ${agreedMarker}, got ${actualMarker}`)
      }
      validateCycleRecord(cycle)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      continue
    }
    const expectedHash = cycle.networkConfigHash
    const nodes = dependencies.shuffle
      ? dependencies.shuffle([...activeNodes])
      : [...activeNodes].sort(() => Math.random() - 0.5)

    for (const node of nodes) {
      const ip = node.ip ?? node.externalIp
      const port = node.port ?? node.externalPort
      if (!ip || !port) continue
      try {
        const response = await get(`${ip}:${port}/netconfig`)
        if (!response || !response.config || typeof response.networkConfigHash !== 'string') {
          throw new Error('empty or malformed response')
        }
        const verified = validateNetworkConfig(response.config)
        const actualPayloadHash = payloadHash(verified)
        if (actualPayloadHash !== response.networkConfigHash || actualPayloadHash !== expectedHash) {
          throw new Error('network configuration hash mismatch')
        }
        applyNetworkConfig(target, verified)
        if (hash(target) !== expectedHash) throw new Error('applied network configuration hash mismatch')
        const applied = {
          networkConfigHash: expectedHash,
          networkConfigCycleMarker: agreedMarker,
          cycleCounter: cycle.counter,
        }
        setAppliedNetworkConfig(applied)
        return applied
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }
  }
  throw new Error(`Unable to adopt accepted network configuration after ${attempts} attempts: ${lastError.message}`)
}
