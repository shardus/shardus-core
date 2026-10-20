import { P2P } from '@shardus/lib-types'
import { setTimeout as sleep } from 'timers/promises'
import { NETWORK_CONFIG_HASH_PATTERN } from './networkConfigConstants'
import { logFlags } from '../logger'
import * as http from '../http'
import { StrictServerConfiguration } from '../shardus/shardus-types'
import {
  AppliedNetworkConfig,
  applyNetworkConfig,
  hashLocalNetworkConfig,
  hashNetConfig,
  setAppliedNetworkConfigMetadata,
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

export interface NetworkConfigInitializationDependencies {
  signal?: AbortSignal
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
  dependencies: NetworkConfigInitializationDependencies,
  attempts = 3
): Promise<AppliedNetworkConfig> {
  const get = dependencies.get ?? ((url: string) => http.get(url) as Promise<NetConfigResponse>)
  const hash = dependencies.hash ?? hashLocalNetworkConfig
  const payloadHash = dependencies.payloadHash ?? hashNetConfig
  const queryCycleMarker =
    dependencies.queryCycleMarker ??
    (async (nodes: ActiveNode[]): Promise<CycleMarkerQueryResult> => {
      const result = await robustQueryForCycleRecordHash(nodes as P2P.SyncTypes.ActiveNode[])
      if (result.isErr()) throw result.error
      return {
        marker: result.value.value?.currentCycleHash,
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
    /* prettier-ignore */ if (logFlags.verbose) console.log('[config-enforced] initialization-attempt', { attempt: attempt + 1, attempts, peers: activeNodes.length })
    dependencies.signal?.throwIfAborted()
    let cycle: P2P.CycleCreatorTypes.CycleRecord
    let robustQueryCycleMarker: string
    let markerNodes: ActiveNode[]
    try {
      const markerResult = await queryCycleMarker(activeNodes)
      dependencies.signal?.throwIfAborted()
      robustQueryCycleMarker = markerResult.marker
      markerNodes = markerResult.winningNodes
      if (!robustQueryCycleMarker) throw new Error('initial cycle marker is not available yet')
      if (!new RegExp(NETWORK_CONFIG_HASH_PATTERN).test(robustQueryCycleMarker))
        throw new Error('cycle marker is malformed')
      if (!Array.isArray(markerNodes) || markerNodes.length === 0) {
        throw new Error('no robust cycle marker agreement')
      }
      cycle = await fetchCycleByMarker(markerNodes[0], robustQueryCycleMarker)
      dependencies.signal?.throwIfAborted()
      const computedCycleRecordHash = dependencies.makeCycleMarker(cycle)
      if (computedCycleRecordHash !== robustQueryCycleMarker) {
        throw new Error(`cycle marker mismatch: expected ${robustQueryCycleMarker}, got ${computedCycleRecordHash}`)
      }
      validateCycleRecord(cycle)
      /* prettier-ignore */ if (logFlags.verbose) console.log('[config-enforced] cycle-verified', { cycle: cycle.counter, marker: robustQueryCycleMarker, verifiedCycleRecordNetConfigHash: cycle.networkConfigHash })
    } catch (error) {
      dependencies.signal?.throwIfAborted()
      lastError = error instanceof Error ? error : new Error(String(error))
      /* prettier-ignore */ if (logFlags.verbose) console.log('[config-enforced] cycle-query-failed', { attempt: attempt + 1, reason: lastError.message })
      continue
    }
    const verifiedCycleMarker = robustQueryCycleMarker
    const verifiedCycleRecordNetConfigHash = cycle.networkConfigHash
    const nodes = dependencies.shuffle
      ? dependencies.shuffle([...activeNodes])
      : [...activeNodes].sort(() => Math.random() - 0.5)

    for (const node of nodes) {
      dependencies.signal?.throwIfAborted()
      const ip = node.ip ?? node.externalIp
      const port = node.port ?? node.externalPort
      if (!ip || !port) continue
      try {
        /* prettier-ignore */ if (logFlags.verbose) console.log('[config-enforced] config-fetch', { peer: ip + ":" + port, verifiedCycleRecordNetConfigHash })
        const response = await get(`${ip}:${port}/netconfig`)
        dependencies.signal?.throwIfAborted()
        if (!response || !response.config || typeof response.networkConfigHash !== 'string') {
          throw new Error('empty or malformed response')
        }
        const netConfigResponseReportedHash = response.networkConfigHash
        const verified = validateNetworkConfig(response.config)
        const downloadedNetConfigComputedHash = payloadHash(verified)
        if (
          downloadedNetConfigComputedHash !== netConfigResponseReportedHash ||
          downloadedNetConfigComputedHash !== verifiedCycleRecordNetConfigHash
        ) {
          /* prettier-ignore */ if (logFlags.verbose) console.log('[config-enforced] config-hash-mismatch', { peer: ip + ':' + port, verifiedCycleRecordNetConfigHash, netConfigResponseReportedHash, downloadedNetConfigComputedHash })
          throw new Error('network configuration hash mismatch')
        }
        /* prettier-ignore */ if (logFlags.verbose) console.log('[config-enforced] payload-verified', { peer: ip + ":" + port, hash: downloadedNetConfigComputedHash, cycle: cycle.counter })
        const candidate = JSON.parse(JSON.stringify(target)) as StrictServerConfiguration
        applyNetworkConfig(candidate, verified)
        const appliedConfigComputedHash = hash(candidate)
        if (appliedConfigComputedHash !== verifiedCycleRecordNetConfigHash)
          throw new Error('applied network configuration hash mismatch')
        dependencies.signal?.throwIfAborted()
        applyNetworkConfig(target, verified)
        const applied = {
          networkConfigHash: verifiedCycleRecordNetConfigHash,
          networkConfigCycleMarker: verifiedCycleMarker,
          cycleCounter: cycle.counter,
        }
        setAppliedNetworkConfigMetadata(applied)
        /* prettier-ignore */ if (logFlags.verbose) console.log('[config-enforced] config-applied', { ...applied, peer: ip + ":" + port })
        return applied
      } catch (error) {
        dependencies.signal?.throwIfAborted()
        lastError = error instanceof Error ? error : new Error(String(error))
        /* prettier-ignore */ if (logFlags.verbose) console.log('[config-enforced] config-peer-failed', { peer: ip + ":" + port, attempt: attempt + 1, reason: lastError.message })
      }
    }
  }
  throw new Error(`Unable to adopt accepted network configuration after ${attempts} attempts: ${lastError.message}`)
}

/** Retry a complete discovery/adoption round until ready or shutdown is requested. */
export async function waitForNetworkConfig<T>(attempt: () => Promise<T>, signal: AbortSignal): Promise<T> {
  const started = Date.now()
  for (let round = 1; ; round++) {
    signal.throwIfAborted()
    try {
      const result = await attempt()
      signal.throwIfAborted()
      return result
    } catch (error) {
      signal.throwIfAborted()
      /* prettier-ignore */ if (logFlags.verbose) console.log('[config-enforced] initialization-waiting', { attempt: round, elapsedMs: Date.now() - started, retryDelayMs: 5000, reason: error instanceof Error ? error.message : String(error) })
      await sleep(5000, undefined, { signal })
    }
  }
}
