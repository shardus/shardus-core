import Ajv, { ValidateFunction } from 'ajv'
import { DevSecurityLevel, StrictServerConfiguration } from '../shardus/shardus-types'
import SERVER_CONFIG from './server'
import { crypto } from '../p2p/Context'

/** The fields committed to by networkConfigHash version 2. */
const TOP_LEVEL_FIELDS = [
  'globalAccount',
  'nonceMode',
  'heartbeatInterval',
  'transactionExpireTime',
  'p2p',
  'sharding',
  'stateManager',
  'features',
] as const

const SELECTOR_FIELDS = new Set(['existingArchivers', 'netConfigV2', 'networkConfigHashEnforcement'])
const P2P_FIELDS = Object.freeze(Object.keys(SERVER_CONFIG.p2p).filter((key) => !SELECTOR_FIELDS.has(key)))
const SHARDING_FIELDS = Object.freeze(Object.keys(SERVER_CONFIG.sharding))
const STATE_MANAGER_FIELDS = Object.freeze(Object.keys(SERVER_CONFIG.stateManager))
const FEATURES_FIELDS = Object.freeze(Object.keys(SERVER_CONFIG.features))

export interface NetworkConfig {
  globalAccount: StrictServerConfiguration['globalAccount']
  nonceMode: StrictServerConfiguration['nonceMode']
  heartbeatInterval: StrictServerConfiguration['heartbeatInterval']
  transactionExpireTime: StrictServerConfiguration['transactionExpireTime']
  p2p: Partial<StrictServerConfiguration['p2p']>
  sharding: StrictServerConfiguration['sharding']
  stateManager: StrictServerConfiguration['stateManager']
  features: StrictServerConfiguration['features']
  debug: {
    devPublicKeys: Record<string, DevSecurityLevel>
    multisigKeys: Record<string, DevSecurityLevel>
  }
}

export interface AppliedNetworkConfig {
  networkConfigHash: string
  networkConfigCycleMarker: string
  cycleCounter: number
}

let appliedNetworkConfig: AppliedNetworkConfig | null = null

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function project(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of fields) result[field] = clone(source[field])
  return result
}

export function buildNetworkConfig(config: StrictServerConfiguration): NetworkConfig {
  const projected = project(config as unknown as Record<string, unknown>, TOP_LEVEL_FIELDS)
  projected.p2p = project(config.p2p as unknown as Record<string, unknown>, P2P_FIELDS)
  projected.sharding = project(config.sharding as unknown as Record<string, unknown>, SHARDING_FIELDS)
  projected.stateManager = project(config.stateManager as unknown as Record<string, unknown>, STATE_MANAGER_FIELDS)
  projected.features = project(config.features as unknown as Record<string, unknown>, FEATURES_FIELDS)
  projected.debug = {
    devPublicKeys: clone(config.debug.devPublicKeys),
    multisigKeys: clone(config.debug.multisigKeys),
  }
  return projected as unknown as NetworkConfig
}

export function hashNetworkConfig(config: StrictServerConfiguration): string {
  return crypto.hash(buildNetworkConfig(config))
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

const referenceConfig = buildNetworkConfig(SERVER_CONFIG)
const networkConfigSchema = schemaFor(referenceConfig)
const schemaProperties = networkConfigSchema.properties as Record<string, Record<string, unknown>>
const securityLevelSchema = {
  type: 'integer',
  enum: Object.values(DevSecurityLevel).filter((value) => typeof value === 'number'),
}
for (const key of ['devPublicKeys', 'multisigKeys']) {
  const debugSchema = schemaProperties.debug.properties as Record<string, Record<string, unknown>>
  debugSchema[key] = { type: 'object', additionalProperties: securityLevelSchema }
}

const validate: ValidateFunction = new Ajv({ allErrors: true }).compile(networkConfigSchema)

export function validateNetworkConfig(value: unknown): NetworkConfig {
  if (!validate(value)) {
    const detail = validate.errors?.map((error) => `${error.dataPath || '/'} ${error.message}`).join('; ')
    throw new Error(`Invalid network configuration: ${detail || 'schema validation failed'}`)
  }
  return clone(value as NetworkConfig)
}

export function applyNetworkConfig(target: StrictServerConfiguration, verifiedConfig: NetworkConfig): void {
  const safeConfig = validateNetworkConfig(verifiedConfig)
  for (const field of TOP_LEVEL_FIELDS) {
    if (field === 'p2p' || field === 'sharding' || field === 'stateManager' || field === 'features') continue
    ;(target as unknown as Record<string, unknown>)[field] = clone(
      (safeConfig as unknown as Record<string, unknown>)[field]
    )
  }
  Object.assign(target.p2p, clone(safeConfig.p2p))
  Object.assign(target.sharding, clone(safeConfig.sharding))
  Object.assign(target.stateManager, clone(safeConfig.stateManager))
  Object.assign(target.features, clone(safeConfig.features))
  target.debug.devPublicKeys = clone(safeConfig.debug.devPublicKeys)
  target.debug.multisigKeys = clone(safeConfig.debug.multisigKeys)
}

export function setAppliedNetworkConfig(value: AppliedNetworkConfig | null): void {
  appliedNetworkConfig = value ? { ...value } : null
}

export function getAppliedNetworkConfig(): AppliedNetworkConfig | null {
  return appliedNetworkConfig ? { ...appliedNetworkConfig } : null
}

export const networkConfigHashPattern = '^[a-fA-F0-9]{64}$'
