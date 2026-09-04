import { P2P } from '@shardus/lib-types'
import * as http from '../http'
import { StrictServerConfiguration } from '../shardus/shardus-types'
import {
  AppliedNetworkConfig,
  applyNetworkConfig,
  hashNetworkConfig,
  setAppliedNetworkConfig,
  validateNetworkConfig,
} from './networkConfig'

type ActiveNode = Partial<P2P.SyncTypes.ActiveNode> & Partial<P2P.NodeListTypes.Node>
type NetConfigResponse = { config: unknown; networkConfigHash: string }

export interface NetworkConfigBootstrapDependencies {
  getNewestCycle(nodes: ActiveNode[]): Promise<P2P.CycleCreatorTypes.CycleRecord>
  makeCycleMarker(cycle: P2P.CycleCreatorTypes.CycleRecord): string
  get?: (url: string) => Promise<NetConfigResponse>
  shuffle?: (nodes: ActiveNode[]) => ActiveNode[]
  hash?: (config: StrictServerConfiguration) => string
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
  let lastError: Error = new Error('No active node supplied a network configuration')

  for (let attempt = 0; attempt < attempts; attempt++) {
    const cycle = await dependencies.getNewestCycle(activeNodes)
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
        const payloadHash = hash(verified as unknown as StrictServerConfiguration)
        if (payloadHash !== response.networkConfigHash || payloadHash !== expectedHash) {
          throw new Error('network configuration hash mismatch')
        }
        applyNetworkConfig(target, verified)
        if (hash(target) !== expectedHash) throw new Error('applied network configuration hash mismatch')
        const applied = {
          networkConfigHash: expectedHash,
          networkConfigCycleMarker: dependencies.makeCycleMarker(cycle),
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
