import { Logger } from 'log4js'
import * as utils from '../utils'
import * as Comms from './Comms'
import { config, crypto, logger } from './Context'
import * as CycleCreator from './CycleCreator'
import { Changer, Utils ,P2PTypes, ActiveTypes, CycleCreatorTypes, NodeListTypes } from 'shardus-parser'
import * as NodeList from './NodeList'
import * as Self from './Self'
import {logFlags} from '../logger'
/** ROUTES */

const gossipActiveRoute: P2PTypes.GossipHandler<ActiveTypes.SignedActiveRequest> = (
  payload,
  sender
) => {
  if (logFlags.p2pNonFatal)
    info(`Got active request: ${JSON.stringify(payload)}`)
  let err = ''
  err = Utils.validateTypes(payload, {nodeId:'s',status:'s',timestamp:'n',sign:'o'})
  if (err){ warn('bad input '+err); return }
  err = Utils.validateTypes(payload.sign, {owner:'s',sig:'s'})
  if (err){ warn('bad input sign '+err); return }

  const signer = NodeList.byPubKey.get(payload.sign.owner)
  if (!signer) {
    warn('Got active request from unknown node')
  }
  const isOrig = signer.id === sender

  // Only accept original txs in quarter 1
  if (isOrig && CycleCreator.currentQuarter > 1) return

  // Do not forward gossip after quarter 2
  if (!isOrig && CycleCreator.currentQuarter > 2) return

  if (addActiveTx(payload)) Comms.sendGossip('gossip-active', payload)
}

const routes = {
  internal: {},
  gossip: {
    'gossip-active': gossipActiveRoute,
  },
}

/** STATE */

let p2pLogger: Logger

let activeRequests: Map<NodeListTypes.Node['publicKey'], ActiveTypes.SignedActiveRequest>
let queuedRequest: ActiveTypes.ActiveRequest

/** FUNCTIONS */

/** CycleCreator Functions */

export function init() {
  // Init logger
  p2pLogger = logger.getLogger('p2p')

  // Init state
  reset()

  // Register routes
  for (const [name, handler] of Object.entries(routes.internal)) {
    Comms.registerInternal(name, handler)
  }
  for (const [name, handler] of Object.entries(routes.gossip)) {
    Comms.registerGossipHandler(name, handler)
  }
}

export function reset() {
  activeRequests = new Map()
}

export function getTxs(): ActiveTypes.Txs {
  return {
    active: [...activeRequests.values()],
  }
}

export function validateRecordTypes(rec: ActiveTypes.Record): string{
  let err = Utils.validateTypes(rec,{active:'n',activated:'a',activatedPublicKeys:'a'})
  if (err) return err
  for (const item of rec.activated) {
    if (typeof item !== 'string')
      return 'items of activated array must be strings'
  }
  for (const item of rec.activatedPublicKeys) {
    if (typeof item !== 'string')
      return 'items of activatedPublicKeys array must be strings'
  }
  return ''
}


export function dropInvalidTxs(txs: ActiveTypes.Txs): ActiveTypes.Txs {
  const active = txs.active.filter(request => validateActiveRequest(request))
  return { active }
}

export function updateRecord(
  txs: ActiveTypes.Txs,
  record: CycleCreatorTypes.CycleRecord,
  _prev: CycleCreatorTypes.CycleRecord
) {
  const active = NodeList.activeByIdOrder.length
  const activated = []
  const activatedPublicKeys = []

  for (const request of txs.active) {
    const publicKey = request.sign.owner
    const node = NodeList.byPubKey.get(publicKey)
    if (node) {
      activated.push(node.id)
      activatedPublicKeys.push(node.publicKey)
    }
  }

  record.active = active
  record.activated = activated.sort()
  record.activatedPublicKeys = activatedPublicKeys.sort()
}

export function parseRecord(record: CycleCreatorTypes.CycleRecord): Changer.Change {
  // Look at the activated id's and make Self emit 'active' if your own id is there
  if (record.activated.includes(Self.id)) {
    Self.setActive()
    Self.emitter.emit('active', Self.id)
  }

  // For all nodes described by activated, make an update to change their status to active
  const updated = record.activated.map((id) => ({
    id,
    activeTimestamp: record.start,
    status: P2PTypes.NodeStatus.ACTIVE,
  }))

  return {
    added: [],
    removed: [],
    updated,
  }
}

export function sendRequests() {
  if (queuedRequest) {
    const activeTx = crypto.sign(queuedRequest)
    queuedRequest = undefined

    if (logFlags.p2pNonFatal)
      info(`Gossiping active request: ${JSON.stringify(activeTx)}`)
    addActiveTx(activeTx)
    Comms.sendGossip('gossip-active', activeTx)

    // Check if we went active and try again if we didn't in 1 cycle duration
    const activeTimeout = setTimeout(
      requestActive,
      config.p2p.cycleDuration * 1000 + 500
    )

    Self.emitter.once('active', () => {
      info(`Went active!`)
      clearTimeout(activeTimeout)
    })
  }
}

export function queueRequest(request: ActiveTypes.ActiveRequest) {
  queuedRequest = request
}

/** Module Functions */

export function requestActive() {
  // Create an active request and queue it to be sent
  const request = createActiveRequest()
  queueRequest(request)
}

function createActiveRequest(): ActiveTypes.ActiveRequest {
  const request = {
    nodeId: Self.id,
    status: 'active',
    timestamp: utils.getTime(),
  }
  return request
}

function addActiveTx(request: ActiveTypes.SignedActiveRequest) {
  if (!request) return false
  if (!validateActiveRequest(request)) return false
  if (activeRequests.has(request.sign.owner)) return false

  activeRequests.set(request.sign.owner, request)
  return true
}

function validateActiveRequest(request: ActiveTypes.SignedActiveRequest) {
  // [TODO] Validate active request
  return true
}

function info(...msg) {
  const entry = `Active: ${msg.join(' ')}`
  p2pLogger.info(entry)
}

function warn(...msg) {
  const entry = `Active: ${msg.join(' ')}`
  p2pLogger.warn(entry)
}

function error(...msg) {
  const entry = `Active: ${msg.join(' ')}`
  p2pLogger.error(entry)
}
