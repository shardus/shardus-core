import Ajv, { ValidateFunction } from 'ajv'
import {
  baseNetworkConfigOmissions,
  NetworkConfig,
  DevSecurityLevel,
  StrictServerConfiguration,
} from '../shardus/shardus-types'
import SERVER_CONFIG from './server'
import { crypto } from '../p2p/Context'
import { NETWORK_CONFIG_HASH_PATTERN } from './networkConfigConstants'

const OPTIONAL_P2P_FIELDS = new Set(['factv2', 'getTxTimestampTimeoutOffset', 'patchNetworkAccountSyncFixes'])

export type { NetworkConfig } from '../shardus/shardus-types'

export interface AppliedNetworkConfig {
  networkConfigHash: string
  networkConfigCycleMarker: string
  cycleCounter: number
}

let appliedNetworkConfig: AppliedNetworkConfig | null = null
const selectedFields = new Map<string, 'include' | 'exclude'>()

function clone<T>(value: T): T {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value)) as T
}

/** Original field selection, excluding local archivers and the two flags added by config enforcement. */
export function buildLegacyNetworkConfig(config: StrictServerConfiguration): Record<string, unknown> {
  const netConfig = {
    crypto: config.crypto,
    heartbeatInterval: config.heartbeatInterval,
    loadDetection: config.loadDetection,
    network: config.network,
    rateLimiting: config.rateLimiting,
    sharding: config.sharding,
    transactionExpireTime: config.transactionExpireTime,
    p2p: { ...config.p2p },
    stateManager: config.stateManager,
    debug: config.debug,
  }
  delete netConfig.p2p.existingArchivers
  delete netConfig.p2p.netConfigV2
  delete netConfig.p2p.networkConfigHashEnforcement
  return clone(netConfig)
}

export function buildNetworkConfig(config: StrictServerConfiguration): NetworkConfig {
  const networkConfigPayload = clone(config)
  for (const omittedFieldName of baseNetworkConfigOmissions.server) {
    Reflect.deleteProperty(networkConfigPayload, omittedFieldName)
  }
  for (const configSection of ['p2p', 'debug'] as const) {
    for (const omittedFieldName of baseNetworkConfigOmissions[configSection]) {
      Reflect.deleteProperty(networkConfigPayload[configSection], omittedFieldName)
    }
  }
  for (const [path, action] of selectedFields) {
    const parts = path.split('.')
    const field = parts.pop() as string
    if (action === 'include') {
      // A selected path can be absent from a config built elsewhere; include only values that exist,
      // without creating empty parents.
      const value = parts.reduce<any>((node, part) => node?.[part], config)?.[field]
      if (value === undefined) continue
      let target: any = networkConfigPayload
      for (const part of parts) {
        if (target[part] === null || typeof target[part] !== 'object') target[part] = {}
        target = target[part]
      }
      target[field] = clone(value)
    } else {
      const parent = parts.reduce<any>((node, part) => node?.[part], networkConfigPayload)
      if (parent !== null && typeof parent === 'object') delete parent[field]
    }
  }
  return networkConfigPayload as NetworkConfig
}

export function hashLocalNetworkConfig(config: StrictServerConfiguration): string {
  return crypto.hash(config.p2p.netConfigV2 ? buildNetworkConfig(config) : buildLegacyNetworkConfig(config))
}

export function hashNetConfig(payload: NetworkConfig | Record<string, unknown>): string {
  return crypto.hash(payload)
}

function schemaFor(value: unknown, baseline: unknown = value): Record<string, unknown> {
  if (Array.isArray(value)) {
    const items = Array.isArray(baseline) ? baseline : value
    const itemSchema = items.length > 0 ? schemaFor(items[0]) : {}
    return { type: 'array', items: itemSchema }
  }
  if (value !== null && typeof value === 'object') {
    const properties: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(value)) {
      properties[key] = schemaFor(nestedValue, baseline?.[key] ?? nestedValue)
    }
    return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
  }
  // Numbers are not split into integer/fractional by their default value: the payload hash, not the
  // adoption schema, decides which values the network runs. Semantic ranges belong where values are set.
  if (typeof baseline === 'number') return { type: 'number' }
  return { type: typeof baseline }
}

/** JSON cannot carry non-finite numbers; reject them before cloning silently turns them into null. */
function assertFiniteNumbers(value: unknown, path = ''): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Invalid network configuration: ${path || '/'} is not finite`)
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteNumbers(item, `${path}[${index}]`))
  } else if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) assertFiniteNumbers(nested, `${path}.${key}`)
  }
}

let validate: ValidateFunction

function rebuildSchema(config: StrictServerConfiguration): void {
  const networkConfigSchema = schemaFor(buildNetworkConfig(config), SERVER_CONFIG)
  const schemaProperties = networkConfigSchema.properties as Record<string, Record<string, unknown>>
  const p2pSchema = schemaProperties.p2p as {
    required?: string[]
    properties: Record<string, Record<string, unknown>>
  }
  if (Array.isArray(p2pSchema.required)) {
    p2pSchema.required = p2pSchema.required.filter((field) => !OPTIONAL_P2P_FIELDS.has(field))
  }
  const securityLevelSchema = {
    type: 'integer',
    enum: Object.values(DevSecurityLevel).filter((value) => typeof value === 'number'),
  }
  // Explicit protocol type, not inferred from a default: security levels are DevSecurityLevel values.
  const debugSchema = schemaProperties.debug?.properties as Record<string, Record<string, unknown>>
  for (const key of ['devPublicKeys', 'multisigKeys']) {
    if (debugSchema && key in debugSchema)
      debugSchema[key] = { type: 'object', additionalProperties: securityLevelSchema }
  }
  validate = new Ajv({ allErrors: true }).compile(networkConfigSchema)
}

rebuildSchema(SERVER_CONFIG)

/**
 * Rebuild the adoption schema from the live config, e.g. after app migrations have assigned values or
 * changed selections, so the expected payload shape matches this node's migrated config.
 */
export function refreshNetworkConfigSchema(config: StrictServerConfiguration): void {
  rebuildSchema(config)
}

export function selectNetworkConfigField(
  config: StrictServerConfiguration,
  path: string,
  action: 'include' | 'exclude'
): void {
  const parts = path.split('.')
  if (parts.some((part) => !part || part === '__proto__' || part === 'constructor' || part === 'prototype'))
    throw new Error(`Invalid network configuration field: ${path}`)
  let source: any = config
  for (const part of parts) {
    // Arrays are selected as a whole; the schema has no way to describe a single excluded element.
    if (Array.isArray(source)) throw new Error(`Array elements cannot be selected: ${path}`)
    if (source === null || typeof source !== 'object' || !Object.prototype.hasOwnProperty.call(source, part))
      throw new Error(`Unknown network configuration field: ${path}`)
    source = source[part]
  }
  const base = parts[0]
  if (
    (base === 'p2p' && parts.length === 1) ||
    (base === 'debug' && parts.length === 1) ||
    baseNetworkConfigOmissions.server.includes(base as any) ||
    (parts.length > 1 &&
      (base === 'p2p' || base === 'debug') &&
      (baseNetworkConfigOmissions[base] as readonly string[]).includes(parts[1]))
  )
    throw new Error(`Protected network configuration field: ${path}`)
  const previous = [...selectedFields]
  selectedFields.delete(path)
  selectedFields.set(path, action)
  try {
    rebuildSchema(config)
  } catch (error) {
    selectedFields.clear()
    for (const [field, selection] of previous) selectedFields.set(field, selection)
    throw error
  }
}

export function validateNetworkConfig(value: unknown): NetworkConfig {
  assertFiniteNumbers(value)
  if (!validate(value)) {
    const detail = validate.errors?.map((error) => `${error.dataPath || '/'} ${error.message}`).join('; ')
    throw new Error(`Invalid network configuration: ${detail || 'schema validation failed'}`)
  }
  return clone(value as NetworkConfig)
}

export function applyNetworkConfig(target: StrictServerConfiguration, verifiedConfig: NetworkConfig): void {
  const safeConfig = validateNetworkConfig(verifiedConfig)
  const apply = (destination: any, governed: any, incoming: any): void => {
    for (const key of new Set([...Object.keys(governed), ...Object.keys(incoming)])) {
      if (!Object.prototype.hasOwnProperty.call(incoming, key)) {
        delete destination[key]
      } else if (incoming[key] !== null && typeof incoming[key] === 'object' && !Array.isArray(incoming[key])) {
        if (!destination[key] || typeof destination[key] !== 'object') destination[key] = {}
        apply(destination[key], governed[key] ?? {}, incoming[key])
      } else {
        destination[key] = incoming[key]
      }
    }
  }
  apply(target, buildNetworkConfig(target), safeConfig)
}

export function setAppliedNetworkConfigMetadata(value: AppliedNetworkConfig | null): void {
  appliedNetworkConfig = value ? { ...value } : null
}

export function getAppliedNetworkConfigMetadata(): AppliedNetworkConfig | null {
  return appliedNetworkConfig ? { ...appliedNetworkConfig } : null
}

export { NETWORK_CONFIG_HASH_PATTERN }
