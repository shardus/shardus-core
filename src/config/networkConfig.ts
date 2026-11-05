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
    let source: any = config
    let target: any = networkConfigPayload
    for (const part of parts) {
      source = source[part]
      if (!target) break
      if (action === 'include' && !target[part]) target[part] = {}
      target = target[part]
    }
    if (action === 'include') target[field] = clone(source[field])
    else if (target) delete target[field]
  }
  return networkConfigPayload as NetworkConfig
}

export function hashLocalNetworkConfig(config: StrictServerConfiguration): string {
  return crypto.hash(config.p2p.netConfigV2 ? buildNetworkConfig(config) : buildLegacyNetworkConfig(config))
}

export function hashNetConfig(payload: NetworkConfig | Record<string, unknown>): string {
  return crypto.hash(payload)
}

function schemaFor(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const itemSchema = value.length > 0 ? schemaFor(value[0]) : {}
    return { type: 'array', items: itemSchema }
  }
  if (value !== null && typeof value === 'object') {
    const properties: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(value)) properties[key] = schemaFor(nestedValue)
    return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
  }
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' }
  return { type: typeof value }
}

let validate: ValidateFunction

function rebuildSchema(config: StrictServerConfiguration): void {
  const networkConfigSchema = schemaFor(buildNetworkConfig(config))
  const schemaProperties = networkConfigSchema.properties as Record<string, Record<string, unknown>>
  const p2pSchema = schemaProperties.p2p as {
    required?: string[]
    properties: Record<string, Record<string, unknown>>
  }
  // Rotation and cycle retention support fractional multipliers despite integer defaults.
  p2pSchema.properties.rotationCountMultiply = { type: 'number' }
  p2pSchema.properties.extraCyclesToKeepMultiplier = { type: 'number' }
  if (Array.isArray(p2pSchema.required)) {
    p2pSchema.required = p2pSchema.required.filter((field) => !OPTIONAL_P2P_FIELDS.has(field))
  }
  const securityLevelSchema = {
    type: 'integer',
    enum: Object.values(DevSecurityLevel).filter((value) => typeof value === 'number'),
  }
  for (const key of ['devPublicKeys', 'multisigKeys']) {
    const debugSchema = schemaProperties.debug.properties as Record<string, Record<string, unknown>>
    if (debugSchema && key in debugSchema) debugSchema[key] = { type: 'object', additionalProperties: securityLevelSchema }
  }
  validate = new Ajv({ allErrors: true }).compile(networkConfigSchema)
}

rebuildSchema(SERVER_CONFIG)

export function selectNetworkConfigField(config: StrictServerConfiguration, path: string, action: 'include' | 'exclude'): void {
  const parts = path.split('.')
  if (parts.some((part) => !part || part === '__proto__' || part === 'constructor' || part === 'prototype'))
    throw new Error(`Invalid network configuration field: ${path}`)
  let source: any = config
  for (const part of parts) {
    if (source === null || typeof source !== 'object' || !Object.prototype.hasOwnProperty.call(source, part))
      throw new Error(`Unknown network configuration field: ${path}`)
    source = source[part]
  }
  const base = parts[0]
  if (base === 'p2p' && parts.length === 1 || base === 'debug' && parts.length === 1 ||
      baseNetworkConfigOmissions.server.includes(base as any) ||
      (parts.length > 1 && (base === 'p2p' || base === 'debug') &&
       (baseNetworkConfigOmissions[base] as readonly string[]).includes(parts[1])))
    throw new Error(`Protected network configuration field: ${path}`)
  const previous = selectedFields.get(path)
  selectedFields.delete(path)
  selectedFields.set(path, action)
  try { rebuildSchema(config) } catch (error) {
    if (previous) selectedFields.set(path, previous)
    else selectedFields.delete(path)
    throw error
  }
}

export function validateNetworkConfig(value: unknown): NetworkConfig {
  if (!validate(value)) {
    const detail = validate.errors?.map((error) => `${error.dataPath || '/'} ${error.message}`).join('; ')
    throw new Error(`Invalid network configuration: ${detail || 'schema validation failed'}`)
  }
  return clone(value as NetworkConfig)
}

export function applyNetworkConfig(target: StrictServerConfiguration, verifiedConfig: NetworkConfig): void {
  const safeConfig = validateNetworkConfig(verifiedConfig)
  for (const [configSection, value] of Object.entries(safeConfig)) {
    if (value !== null && typeof value === 'object') {
      Object.assign(target[configSection], value)
    } else {
      target[configSection] = value
    }
  }
}

export function setAppliedNetworkConfigMetadata(value: AppliedNetworkConfig | null): void {
  appliedNetworkConfig = value ? { ...value } : null
}

export function getAppliedNetworkConfigMetadata(): AppliedNetworkConfig | null {
  return appliedNetworkConfig ? { ...appliedNetworkConfig } : null
}

export { NETWORK_CONFIG_HASH_PATTERN }
