import Ajv, { ValidateFunction } from 'ajv'
import { DevSecurityLevel, StrictServerConfiguration } from '../shardus/shardus-types'
import SERVER_CONFIG from './server'
import { crypto } from '../p2p/Context'
import { NETWORK_CONFIG_HASH_PATTERN } from './networkConfigConstants'

/** The fields committed to by networkConfigHash version 1. */
const LEGACY_TOP_LEVEL_FIELDS = [
  'crypto',
  'heartbeatInterval',
  'loadDetection',
  'network',
  'rateLimiting',
  'sharding',
  'transactionExpireTime',
  'p2p',
  'stateManager',
  'debug',
] as const

/** The fields committed to by networkConfigHash version 2. Keep this manifest explicit. */
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

const P2P_FIELDS = [
  'ipServers',
  'timeServers',
  'syncLimit',
  'useNTPOffsets',
  'useFakeTimeOffsets',
  'cycleDuration',
  'maxRejoinTime',
  'difficulty',
  'dynamicBogonFiltering',
  'forceBogonFilteringOn',
  'rejectBogonOutboundJoin',
  'queryDelay',
  'gossipRecipients',
  'gossipFactor',
  'dynamicGossipFactor',
  'gossipStartSeed',
  'gossipSeedFallof',
  'gossipTimeout',
  'maxSeedNodes',
  'minNodesToAllowTxs',
  'continueOnException',
  'minNodesPerctToAllowExitOnException',
  'baselineNodes',
  'minNodes',
  'enableMaxStandbyCount',
  'maxStandbyCount',
  'maxNodes',
  'seedNodeOffset',
  'nodeExpiryAge',
  'maxJoinedPerCycle',
  'maxSyncingPerCycle',
  'syncBoostEnabled',
  'maxSyncTimeFloor',
  'maxNodeForSyncTime',
  'maxRotatedPerCycle',
  'flexibleRotationDelta',
  'flexibleRotationEnabled',
  'enableDangerousProblematicNodeRemoval',
  'enableProblematicNodeRemoval',
  'enableProblematicNodeRemovalOnCycle',
  'maxProblematicNodeRemovalsPerCycle',
  'problematicNodeConsecutiveRefuteThreshold',
  'problematicNodeRefutePercentageThreshold',
  'problematicNodeHistoryLength',
  'problematicNodeRemovalCycleFrequency',
  'useProblematicNodeCacheV2',
  'enableProblematicNodeCacheBuilding',
  'firstCycleJoin',
  'maxPercentOfDelta',
  'minScaleReqsNeeded',
  'maxScaleReqs',
  'scaleConsensusRequired',
  'amountToGrow',
  'amountToShrink',
  'maxShrinkMultiplier',
  'scaleInfluenceForShrink',
  'maxDesiredMultiplier',
  'startInWitnessMode',
  'experimentalSnapshot',
  'detectLostSyncing',
  'scaleGroupLimit',
  'useSignaturesForAuth',
  'checkVersion',
  'extraCyclesToKeep',
  'extraCyclesToKeepMultiplier',
  'checkNetworkStopped',
  'archiverNetworkCheckInterval',
  'shouldApopOnNetworkStop',
  'validateActiveRequests',
  'hackForceCycleSyncComplete',
  'uniqueRemovedIds',
  'uniqueRemovedIdsUpdate',
  'uniqueLostIdsUpdate',
  'useLruCacheForSocketMgmt',
  'lruCacheSizeForSocketMgmt',
  'payloadSizeLimitInBytes',
  'headerSizeLimitInBytes',
  'delayLostReportByNumOfCycles',
  'aggregateLostReportsTillQ1',
  'isDownCachePruneCycles',
  'isDownCacheEnabled',
  'stopReportingLostPruneCycles',
  'lostMapPruneCycles',
  'instantForwardReceipts',
  'maxArchiversSubscriptionPerNode',
  'writeSyncProtocolV2',
  'useSyncProtocolV2',
  'validateArchiverAppData',
  'useNetworkModes',
  'useJoinProtocolV2',
  'randomJoinRequestWait',
  'standbyListCyclesTTL',
  'standbyListMaxRemoveTTL',
  'standbyListMaxRemoveApp',
  'standbyAgeScrub',
  'standbyVersionScrub',
  'standbyAgeCheck',
  'q1DelayPercent',
  'goldenTicketEnabled',
  'preGossipNodeCheck',
  'preGossipDownCheck',
  'preGossipLostCheck',
  'preGossipRecentCheck',
  'initShutdown',
  'enableLostArchiversCycles',
  'lostArchiversCyclesToWait',
  'standbyListFastHash',
  'networkBaselineEnabled',
  'useCombinedTellBinary',
  'rotationCountMultiply',
  'rotationCountAdd',
  'rotationPercentActive',
  'rotationMaxAddPercent',
  'rotationMaxRemovePercent',
  'syncFloorEnabled',
  'syncingMaxAddPercent',
  'syncingDesiredMinCount',
  'allowActivePerCycle',
  'allowActivePerCycleRecover',
  'activeRecoveryEnabled',
  'useProxyForDownCheck',
  'numCheckerNodes',
  'minChecksForDown',
  'minChecksForUp',
  'attemptJoiningWaitMultiplier',
  'cyclesToWaitForSyncStarted',
  'cyclesToRefreshEarly',
  'extraNodesToAddInRestart',
  'secondsToCheckForQ1',
  'hardenNewSyncingProtocol',
  'removeLostSyncingNodeFromList',
  'rotationEdgeToAvoid',
  'forcedMode',
  'delayZombieRestartSec',
  'resumbitStandbyRefreshWaitDuration',
  'formingNodesPerCycle',
  'downNodeFilteringEnabled',
  'useFactCorrespondingTell',
  'factv2',
  'resubmitStandbyAddWaitDuration',
  'requiredVotesPercentage',
  'timestampCacheFix',
  'useAjvCycleRecordValidation',
  'networkTransactionsToProcessPerCycle',
  'getTxTimestampTimeoutOffset',
  'dropNGTByGossipEnabled',
  'timestampCacheFixSize',
  'removedNodeIDCacheSize',
  'stuckNGTInQueueFix',
  'nerfNonFoundationCertScores',
  'addFoundationNodeAttribute',
  'preferFoundationNodesForTimestamp',
  'foundationNodeThreshold',
  'patchNetworkAccountSyncFixes',
  'enableShardKeyChanges',
  'maxResponseSize',
  'allowEndUserTxnInjections',
  'newCycleCertScoring',
  'fixApplyReceiptType',
  'syncV2HistoricalCyclesCount',
] as const
const SHARDING_FIELDS = ['nodesPerConsensusGroup', 'nodesPerEdge', 'executeInOneShard'] as const
const STATE_MANAGER_FIELDS = Object.freeze(Object.keys(SERVER_CONFIG.stateManager))
const FEATURES_FIELDS = [
  'dappFeature1enabled',
  'fixHomeNodeCheckForTXGroupChanges',
  'archiverDataSubscriptionsUpdate',
  'startInServiceMode',
  'enableRIAccountsCache',
  'tickets',
] as const
const OPTIONAL_P2P_FIELDS = new Set(['factv2', 'getTxTimestampTimeoutOffset', 'patchNetworkAccountSyncFixes'])

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
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value)) as T
}

function project(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    if (source[field] !== undefined) result[field] = clone(source[field])
  }
  return result
}

export function buildLegacyNetworkConfig(config: StrictServerConfiguration): Record<string, unknown> {
  const projected = project(config as unknown as Record<string, unknown>, LEGACY_TOP_LEVEL_FIELDS)
  projected.p2p = project(config.p2p as unknown as Record<string, unknown>, P2P_FIELDS)
  return projected
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

export function hashLocalNetworkConfig(config: StrictServerConfiguration): string {
  return crypto.hash(config.p2p.netConfigV2 === false ? buildLegacyNetworkConfig(config) : buildNetworkConfig(config))
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

const referenceConfig = buildNetworkConfig(SERVER_CONFIG)
const networkConfigSchema = schemaFor(referenceConfig)
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

export function setAppliedNetworkConfigMetadata(value: AppliedNetworkConfig | null): void {
  appliedNetworkConfig = value ? { ...value } : null
}

export function getAppliedNetworkConfigMetadata(): AppliedNetworkConfig | null {
  return appliedNetworkConfig ? { ...appliedNetworkConfig } : null
}

export { NETWORK_CONFIG_HASH_PATTERN }
