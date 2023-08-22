/** ROUTES */

import * as Comms from '../Comms'
import * as CycleChain from '../CycleChain'
import * as CycleCreator from '../CycleCreator'
import * as NodeList from '../NodeList'
import * as Self from '../Self'
import * as utils from '../../utils'
import { Handler } from "express"
import { P2P } from "@shardus/types"
import { addJoinRequest, getAllowBogon, setAllowBogon, warn } from "."
import { config } from '../Context'
import { isBogonIP } from '../../utils/functions/checkIP'
import { isPortReachable } from '../../utils/isPortReachable'
import { nestedCountersInstance } from '../../utils/nestedCounters'
import { profilerInstance } from '../../utils/profiler'

const cycleMarkerRoute: P2P.P2PTypes.Route<Handler> = {
  method: 'GET',
  name: 'cyclemarker',
  handler: (_req, res) => {
    const marker = CycleChain.newest ? CycleChain.newest.previous : '0'.repeat(64)
    res.json(marker)
  },
}

const joinRoute: P2P.P2PTypes.Route<Handler> = {
  method: 'POST',
  name: 'join',
  handler: async (req, res) => {
    const joinRequest = req.body
    if (CycleCreator.currentQuarter < 1) {
      // if currentQuarter <= 0 then we are not ready
      res.end()
      return
    }

    if (
      NodeList.activeByIdOrder.length === 1 &&
      Self.isFirst &&
      isBogonIP(joinRequest.nodeInfo.externalIp) &&
      config.p2p.forceBogonFilteringOn === false
    ) {
      setAllowBogon(true)
    }
    nestedCountersInstance.countEvent('p2p', `join-allow-bogon-firstnode:${getAllowBogon()}`)

    const externalIp = joinRequest.nodeInfo.externalIp
    const externalPort = joinRequest.nodeInfo.externalPort
    const internalIp = joinRequest.nodeInfo.internalIp
    const internalPort = joinRequest.nodeInfo.internalPort

    const externalPortReachable = await isPortReachable({ host: externalIp, port: externalPort })
    const internalPortReachable = await isPortReachable({ host: internalIp, port: internalPort })

    if (!externalPortReachable || !internalPortReachable) {
      return res.json({
        success: false,
        fatal: true,
        reason: `IP or Port is not reachable. ext:${externalIp}:${externalPort} int:${internalIp}:${internalPort}}`,
      })
    }

    //  Validate of joinReq is done in addJoinRequest
    const validJoinRequest = addJoinRequest(joinRequest)

    // if the join request was valid (not fatal) and the port was reachable, this join request is free to be
    // gossiped to all nodes according to Join Protocol v2
    if (config.p2p.useJoinProtocolV2 && !validJoinRequest.fatal) {
      Comms.sendGossip('gossip-valid-join-requests', joinRequest, '', null, NodeList.byIdOrder, true)
    }

    // if the join request was valid and accepted, gossip that this join request
    // was accepted to other nodes
    if (validJoinRequest.success) {
      Comms.sendGossip('gossip-join', joinRequest, '', null, NodeList.byIdOrder, true)
      nestedCountersInstance.countEvent('p2p', 'initiate gossip-join')
    }
    return res.json(validJoinRequest)
  },
}

const joinedRoute: P2P.P2PTypes.Route<Handler> = {
  method: 'GET',
  name: 'joined/:publicKey',
  handler: (req, res) => {
    // Respond with id if node's join request was accepted, otherwise undefined
    let err = utils.validateTypes(req, { params: 'o' })
    if (err) {
      warn('joined/:publicKey bad req ' + err)
      res.json()
    }
    err = utils.validateTypes(req.params, { publicKey: 's' })
    if (err) {
      warn('joined/:publicKey bad req.params ' + err)
      res.json()
    }
    const publicKey = req.params.publicKey
    const node = NodeList.byPubKey.get(publicKey)
    res.json({ node })
  },
}

const gossipJoinRoute: P2P.P2PTypes.GossipHandler<P2P.JoinTypes.JoinRequest, P2P.NodeListTypes.Node['id']> = (
  payload,
  sender,
  tracker
) => {
  profilerInstance.scopedProfileSectionStart('gossip-join')
  try {
    // Do not forward gossip after quarter 2
    if (CycleCreator.currentQuarter >= 3) return

    //  Validate of payload is done in addJoinRequest
    if (addJoinRequest(payload).success)
      Comms.sendGossip('gossip-join', payload, tracker, sender, NodeList.byIdOrder, false)
  } finally {
    profilerInstance.scopedProfileSectionEnd('gossip-join')
  }
}

/**
  * Part of Join Protocol v2. Gossips *all* valid join requests. A join request
  * does not have to be successful to be gossiped.
  */
const gossipValidJoinRequests: P2P.P2PTypes.GossipHandler<P2P.JoinTypes.JoinRequest, P2P.NodeListTypes.Node['id']> = (
  payload: P2P.JoinTypes.JoinRequest,
  sender: P2P.NodeListTypes.Node['id'],
  tracker: string,
) => {
  // do not forward gossip after quarter 2
  if (CycleCreator.currentQuarter > 2) return

  // TODO: add join request to standby node list (not done yet)
  Comms.sendGossip('gossip-valid-join-requests', payload, tracker, sender, NodeList.byIdOrder, false)
}

export const routes = {
  external: [cycleMarkerRoute, joinRoute, joinedRoute],
  gossip: {
    'gossip-join': gossipJoinRoute,
    'gossip-valid-join-requests': gossipValidJoinRequests
  },
}
