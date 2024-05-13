/** ROUTES */

import * as Comms from '../Comms'
import * as CycleChain from '../CycleChain'
import * as CycleCreator from '../CycleCreator'
import * as NodeList from '../NodeList'
import * as Self from '../Self'
import * as utils from '../../utils'
import { Handler } from 'express'
import { P2P } from '@shardus/types'
import {
  addJoinRequest,
  computeSelectionNum,
  getAllowBogon,
  setAllowBogon,
  validateJoinRequest,
  verifyJoinRequestSignature,
  warn,
  queueStandbyRefreshRequest,
  queueJoinRequest,
  verifyJoinRequestTypes
} from '.'
import { config } from '../Context'
import { isBogonIP } from '../../utils/functions/checkIP'
import { isPortReachable } from '../../utils/isPortReachable'
import { nestedCountersInstance } from '../../utils/nestedCounters'
import { profilerInstance } from '../../utils/profiler'
import * as acceptance from './v2/acceptance'
import { attempt } from '../Utils'
import { getStandbyNodesInfoMap, saveJoinRequest, isOnStandbyList } from './v2'
import { addFinishedSyncing } from './v2/syncFinished'
import { processNewUnjoinRequest, UnjoinRequest } from './v2/unjoin'
import { isActive } from '../Self'
import { logFlags } from '../../logger'
import { JoinRequest, StartedSyncingRequest } from "@shardus/types/build/src/p2p/JoinTypes";
import { addSyncStarted } from './v2/syncStarted'
import { addStandbyRefresh } from './v2/standbyRefresh'
import { Utils } from '@shardus/types'
import { testFailChance } from '../../utils'
import { shardusGetTime } from '../../network'

const cycleMarkerRoute: P2P.P2PTypes.Route<Handler> = {
  method: 'GET',
  name: 'cyclemarker',
  handler: (_req, res) => {
    const marker = CycleChain.newest ? CycleChain.newest.previous : '0'.repeat(64)
    res.send(marker)
  },
}

/*
Currently not used

const cycleNumberRoute: P2P.P2PTypes.Route<Handler> = {
  method: 'GET',
  name: 'cyclenumber',
  handler: (_req, res) => {
    const number = CycleChain.newest ? CycleChain.newest.counter : 0
    res.json(number)
  },
}
*/

const joinRoute: P2P.P2PTypes.Route<Handler> = {
  method: 'POST',
  name: 'join',
  handler: async (req, res) => {
    const joinRequest: JoinRequest = DeSerializeFromJsonString(utils.stringify(req.body))

    if (!isActive && !Self.isRestartNetwork) {
      /* prettier-ignore */ nestedCountersInstance.countEvent('p2p', `join-reject: not-active`)
      /* prettier-ignore */ if (logFlags.p2pNonFatal) console.error( `join-reject: not-active`)
      // if we are not active yet, we cannot accept join requests
      return res.status(400).json({
        success: false,
        fatal: false,
        reason: `this node is not active yet`,
      })
    }

    if (CycleCreator.currentQuarter < 1) {
      /* prettier-ignore */ nestedCountersInstance.countEvent('p2p', `join-reject: CycleCreator.currentQuarter < 1 ${CycleCreator.currentQuarter}`)
      /* prettier-ignore */ if (logFlags.p2pNonFatal) console.error( `join-reject: CycleCreator.currentQuarter < 1 ${CycleCreator.currentQuarter} ${joinRequest.nodeInfo.publicKey}`)
      // if currentQuarter <= 0 then we are not ready
      return res.status(400).json({
        success: false,
        fatal: false,
        reason: `Can't join before quarter 1`,
      })
    }

    if (
      (NodeList.activeByIdOrder.length === 1 || Self.isRestartNetwork) &&
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
      /* prettier-ignore */ nestedCountersInstance.countEvent( 'p2p', `join-reject: !externalPortReachable || !internalPortReachable` )
      /* prettier-ignore */ if (logFlags.p2pNonFatal) console.error( `join-reject: !externalPortReachable || !internalPortReachable ${joinRequest.nodeInfo.publicKey} ${Utils.safeStringify({ host: externalIp, port: externalPort })}`)
      return res.send({
        success: false,
        fatal: true,
        //the following message string is used by submitJoinV2.  if you change the string please update submitJoinV2
        reason: `IP or Port is not reachable. ext:${externalIp}:${externalPort} int:${internalIp}:${internalPort}}`,
      })
    }

    // if the port of the join request was reachable, this join request is free to be
    // gossiped to all nodes according to Join Protocol v2.
    if (config.p2p.useJoinProtocolV2) {
      // ensure this join request doesn't already exist in standby nodes
      if (getStandbyNodesInfoMap().has(joinRequest.nodeInfo.publicKey)) {
        /* prettier-ignore */ nestedCountersInstance.countEvent('p2p', `join-reject: already standby`)
        /* prettier-ignore */ if (logFlags.p2pNonFatal) console.error( `join-reject: already standby ${joinRequest.nodeInfo.publicKey}:`)
        return res.status(400).json({
          success: false,
          fatal: false, //this was true before which seems wrong.  Do we want to kill a node that already got in?
          reason: `Join request for pubkey ${joinRequest.nodeInfo.publicKey} already exists as a standby node`,
        })
      }

      // then validate the join request. if it's invalid for any reason, return
      // that reason.
      const validationError = validateJoinRequest(joinRequest)
      if (validationError) {
        if (config.debug.cycleRecordOOSDebugLogs)
          if (validationError.reason !== 'Node has already been seen this cycle. Unable to add join request.')
            console.log(
              'DEBUG CR-OOS: joinRoute: gossipJoin rejected: failed to validate join request: ',
              validationError
            )
        /* prettier-ignore */ nestedCountersInstance.countEvent('p2p', `join-reject: validateJoinRequest ${validationError.reason}`)
        /* prettier-ignore */ if (logFlags.p2pNonFatal) console.error( `join-reject: validateJoinRequest ${validationError.reason} ${joinRequest.nodeInfo.publicKey}:`)
        return res.status(400).json(validationError)
      }
      // then, verify the signature of the join request. this has to be done
      // before selectionNum is calculated because we will mutate the original
      // join request.
      const signatureError = verifyJoinRequestSignature(joinRequest)
      if (signatureError) {
        /* prettier-ignore */ nestedCountersInstance.countEvent('p2p', `join-reject: signature error`)
        /* prettier-ignore */ if (logFlags.p2pNonFatal) console.error( `join-reject: signature error ${joinRequest.nodeInfo.publicKey}:`)
        return res.status(400).json(signatureError)
      }

      // then, calculate the selection number for this join request.
      const selectionNumResult = computeSelectionNum(joinRequest)
      if (selectionNumResult.isErr()) {
        /* prettier-ignore */ nestedCountersInstance.countEvent('p2p', `join-reject: failed selection number ${selectionNumResult.error.reason}`)
        /* prettier-ignore */ if (logFlags.p2pNonFatal) console.error( `failed to compute selection number for node ${joinRequest.nodeInfo.publicKey}:`, Utils.safeStringify(selectionNumResult.error) )
        return res.status(500).json(selectionNumResult.error)
      }
      joinRequest.selectionNum = selectionNumResult.value

      console.log(
        `DEBUG CR-OOS: joinRoute: computed selectionNum for ${joinRequest.nodeInfo.externalPort}'s joinReq: ${joinRequest.selectionNum}`
      )

      if (CycleCreator.currentQuarter > 1) {
        /* prettier-ignore */ nestedCountersInstance.countEvent('p2p', `rejected-late-join-request ${CycleCreator.currentQuarter}`)
        return res.status(400).json({
          success: false,
          fatal: false,
          reason: `Can't join after quarter 1`,
        })
      }

      // following block is DEPRECATED
      // add the join request to the global list of join requests. this will also
      // add it to the list of new join requests that will be processed as part of
      // cycle creation to create a standy node list.
      // saveJoinRequest(joinRequest)

      if (config.debug.cycleRecordOOSDebugLogs)
        console.log(
          `DEBUG CR-OOS: joinRoute: queueing joinReq. pubkey: ${joinRequest.nodeInfo.publicKey}. tInC: ${
            shardusGetTime() - CycleCreator.currentStart
          }`
        )

      // then, queue this join request to be sent when sendRequests is called at the start of Q1
      queueJoinRequest(joinRequest)

      /* prettier-ignore */ nestedCountersInstance.countEvent( 'p2p', `join success` )
      // respond with the number of standby nodes for the user's information
      return res.status(200).send({ success: true, numStandbyNodes: getStandbyNodesInfoMap().size })
    } else {
      //  Validate of joinReq is done in addJoinRequest
      const joinRequestResponse = addJoinRequest(joinRequest)

      // if the join request was valid and accepted, gossip that this join request
      // was accepted to other nodes
      if (joinRequestResponse.success) {
        // only gossip join requests if we are still using the old join protocol
        Comms.sendGossip(
          'gossip-join',
          joinRequest,
          '',
          null,
          [...NodeList.activeByIdOrder, ...NodeList.readyByTimeAndIdOrder],
          true
        )
        nestedCountersInstance.countEvent('p2p', 'initiate gossip-join')
      }
      return res.send(joinRequestResponse)
    }
  },
}

const unjoinRoute: P2P.P2PTypes.Route<Handler> = {
  method: 'POST',
  name: 'unjoin',
  handler: (req, res) => {
    const joinRequest = req.body
    const processResult = processNewUnjoinRequest(joinRequest)
    if (processResult.isErr()) {
      return res.status(500).send(processResult.error)
    }

    Comms.sendGossip(
      'gossip-unjoin',
      joinRequest,
      '',
      null,
      [...NodeList.activeByIdOrder, ...NodeList.readyByTimeAndIdOrder],
      true
    )
  },
}

/*
Currently not used

const syncStartedRoute: P2P.P2PTypes.Route<Handler> = {
  method: 'POST',
  name: 'sync-started',
  handler: (req, res) => {
    const syncStarted = req.body
    const processResult = addSyncStarted(syncStarted)
    if (processResult.success === false) {
      return res.status(500).send(processResult.reason)
    }
    Comms.sendGossip('gossip-sync-started', syncStarted, '', null, NodeList.byIdOrder, true)
    return res.status(200).send()
  },
}
*/
const standbyRefreshRoute: P2P.P2PTypes.Route<Handler> = {
  method: 'POST',
  name: 'standby-refresh',
  handler: async (req, res) => {
    // check if the config.debug.ignoreStandbyRefreshChance is a probability
    if (config.debug.ignoreStandbyRefreshChance < 0 || config.debug.ignoreStandbyRefreshChance > 1) {
      warn(
        'invalid config.debug.ignoreStandbyRefreshChance value: ' + config.debug.ignoreStandbyRefreshChance
      )
      res.status(500).send('invalid config.debug.ignoreStandbyRefreshChance value')
      // check if we should ignore this request for testing purposes
    } else if (config.debug.ignoreStandbyRefreshChance > 0) {
      // if we should ignore this request, sleep for 1.1 seconds since timeout is 1 second
      if (testFailChance(config.debug.ignoreStandbyRefreshChance, 'standby-refresh', '', '', false)) {
        await utils.sleep(3000)
        res.status(500).send('simulated timeout')
      }
    }

    const standbyRefreshPubKey = req.body.publicKey

    let err = utils.validateTypes(req, { body: 'o' })
    if (err) {
      warn('/standby-refresh bad req ' + err)
      res.status(400).send()
    }
    err = typeof standbyRefreshPubKey === 'string' ? '' : 'standbyRefreshPubKey is not a string'
    if (err) {
      warn('/standby-refresh bad standby refresh public key ' + err)
      res.status(400).send()
    }

    queueStandbyRefreshRequest(standbyRefreshPubKey)
    return res.status(200).send()
  },
}

const joinedV2Route: P2P.P2PTypes.Route<Handler> = {
  method: 'GET',
  name: 'joinedV2/:publicKey',
  handler: (req, res) => {
    // Respond with id if node's join request was accepted, otherwise undefined
    let err = utils.validateTypes(req, { params: 'o' })
    if (err) {
      warn('joined/:publicKey bad req ' + err)
      // use res.send({ }) if returning an object
      res.json()
    }
    err = utils.validateTypes(req.params, { publicKey: 's' })
    if (err) {
      warn('joined/:publicKey bad req.params ' + err)
      // use res.send({ }) if returning an object
      res.json()
    }
    const publicKey = req.params.publicKey
    const id = NodeList.byPubKey.get(publicKey)?.id || null
    res.send({ id, isOnStandbyList: isOnStandbyList(publicKey) })
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
      // use res.send({ }) if returning an object
      res.json()
    }
    err = utils.validateTypes(req.params, { publicKey: 's' })
    if (err) {
      warn('joined/:publicKey bad req.params ' + err)
      // use res.send({ }) if returning an object
      res.json()
    }
    const publicKey = req.params.publicKey
    const node = NodeList.byPubKey.get(publicKey)
    res.send({ node })
  },
}

/**
 * todo deprecate this or, finish it
 * for now deprecating the accepted path.  does not seem to have any value
 */
const acceptedRoute: P2P.P2PTypes.Route<Handler> = {
  method: 'POST',
  name: 'accepted',
  handler: async (req, res) => {
    // Turns out the cycle check is unnecessary because the joining node will robust query for its node ID
    // The joinNetwork fn in startupV2 will handle acceptance
    acceptance.getEventEmitter().emit('accepted')

    /*
    const counter = CycleChain.getNewest().counter
    nestedCountersInstance.countEvent('joinV2', `C${counter}: acceptedRoute: start`)

    // check if we even need to check acceptance
    if (acceptance.getHasConfirmedAcceptance() || Self.isActive) {
      return res.status(400).send('no need to check acceptance; this node has already confirmed acceptance')
    } else if (acceptance.isAlreadyCheckingAcceptance()) {
      return res.status(400).send('node is already checking acceptance')
    }

    // then try to confirm acceptance if needed
    try {
      await attempt(
        async () => {
          const result = await acceptance.confirmAcceptance(req.body)

          if (result.isErr()) {
            // transform Err into a thrown Error if needed
            nestedCountersInstance.countEvent('joinV2', `C${counter}: acceptedRoute: confirmAcceptance error`)
            throw result.error
          } else if (!result.value) {
            // if the result is false, acceptance is not confirmed
            nestedCountersInstance.countEvent('joinV2', `C${counter}: acceptedRoute: node not in cycle`)
            throw new Error(`this node was not found in cycle ${req.body.cycleMarker}; assuming not accepted`)
          } else {
            // otherwise, at this point, the node has been confirmed to be accepted
            nestedCountersInstance.countEvent('joinV2', `C${counter}: acceptedRoute: node accepted`)
            acceptance.getEventEmitter().emit('accepted')
          }
        },
        {
          maxRetries: 5,
          delay: 2000,
        }
      )
    } catch (err) {
      nestedCountersInstance.countEvent('joinV2', `C${counter}: acceptedRoute: attempt error`)
      res.status(400).send(err)
    }
    */
  },
}

const gossipJoinRoute: P2P.P2PTypes.GossipHandler<P2P.JoinTypes.JoinRequest, P2P.NodeListTypes.Node['id']> = (
  payload,
  sender,
  tracker
) => {
  // only gossip join requests if we are still using the old join protocol
  if (!config.p2p.useJoinProtocolV2) {
    profilerInstance.scopedProfileSectionStart('gossip-join')
    try {
      // Do not forward gossip after quarter 2
      if (CycleCreator.currentQuarter >= 3) return

      //  Validate of payload is done in addJoinRequest
      if (addJoinRequest(payload).success)
        Comms.sendGossip(
          'gossip-join',
          payload,
          tracker,
          sender,
          [...NodeList.activeByIdOrder, ...NodeList.readyByTimeAndIdOrder],
          false
        )
    } finally {
      profilerInstance.scopedProfileSectionEnd('gossip-join')
    }
  } else warn('gossip-join received but ignored for join protocol v2')
}

/**
 * Part of Join Protocol v2. Gossips all valid join requests.
 */
const gossipValidJoinRequests: P2P.P2PTypes.GossipHandler<
  P2P.JoinTypes.JoinRequest,
  P2P.NodeListTypes.Node['id']
> = (payload: P2P.JoinTypes.JoinRequest, sender: P2P.NodeListTypes.Node['id'], tracker: string) => {
  if (config.debug.cycleRecordOOSDebugLogs) {
    //if (receivedJoin.has(payload.nodeInfo.publicKey) === false) {
    //receivedJoin.set(payload.nodeInfo.publicKey, true)
    const sendingNode = NodeList.activeByIdOrder.find((node) => node.id === sender)
    console.log(
      'DEBUG CR-OOS: gossipValidJoinRequests: ',
      ' sender ',
      sendingNode.externalPort,
      ' payload.pubKey: ',
      payload.nodeInfo.publicKey,
      'cC: ',
      CycleCreator.currentCycle,
      ' cQ: ',
      CycleCreator.currentQuarter
    )
    //}
  }

  // do not forward gossip after quarter 2
  if (CycleCreator.currentQuarter > 2) {
    if (config.debug.cycleRecordOOSDebugLogs)
      console.log(
        'DEBUG CR-OOS: gossipValidJoinRequests: Q is > 2: cC: ',
        CycleCreator.currentCycle,
        ' cQ: ',
        CycleCreator.currentQuarter,
        ' payload id: ',
        payload.nodeInfo.publicKey
      )
    /* prettier-ignore */ nestedCountersInstance.countEvent( 'p2p', `join-gossip-reject: late-request > Q2:  ${CycleCreator.currentQuarter}` )
    return
  }

  // ensure this join request doesn't already exist in standby nodes
  if (getStandbyNodesInfoMap().has(payload.nodeInfo.publicKey)) {
    if (config.debug.cycleRecordOOSDebugLogs)
      console.log(
        'DEBUG CR-OOS: gossipValidJoinRequests: gossipJoin rejected: already standby: ',
        payload.nodeInfo.publicKey
      )
    /* prettier-ignore */ nestedCountersInstance.countEvent( 'p2p', `join-gossip-reject: node already standby` )
    /* prettier-ignore */ if (logFlags.p2pNonFatal) console.error(`join request for pubkey ${payload.nodeInfo.publicKey} already exists as a standby node`)
    return
  }

  // validate the join request first
  const validationError = validateJoinRequest(payload)
  if (validationError) {
    if (config.debug.cycleRecordOOSDebugLogs)
      if (validationError.reason !== 'Node has already been seen this cycle. Unable to add join request.')
        console.log(
          'DEBUG CR-OOS: gossipValidJoinRequests: gossipJoin rejected: failed to validate join request: ',
          validationError
        )
    /* prettier-ignore */ nestedCountersInstance.countEvent( 'p2p', `join-gossip-reject: failed to validate join request` )
    /* prettier-ignore */ if (logFlags.p2pNonFatal)console.error(`failed to validate join request when gossiping: ${validationError}`)
    return
  }

  // then, calculate the selection number for this join request
  const selectionNumResult = computeSelectionNum(payload)
  if (selectionNumResult.isErr()) {
    /* prettier-ignore */ nestedCountersInstance.countEvent( 'p2p', `join-gossip-reject: failed to compute selection number` )
    /* prettier-ignore */ if (logFlags.p2pNonFatal)console.error( `failed to compute selection number for node ${payload.nodeInfo.publicKey}:`, Utils.safeStringify(selectionNumResult.error) )
    return
  }
  if (config.debug.cycleRecordOOSDebugLogs)
    console.log(
      `DEBUG CR-OOS: gossipValidJoinRequests: computed selectionNum for ${payload.nodeInfo.externalPort}'s joinReq: ${selectionNumResult.value}`
    )
  payload.selectionNum = selectionNumResult.value

  if (config.debug.cycleRecordOOSDebugLogs)
    console.log(
      `DEBUG CR-OOS: gossipValidJoinRequests: saving joinReq, pubkey: ${payload.nodeInfo.publicKey}`
    )
  // add the join request to the global list of join requests. this will also
  // add it to the list of new join requests that will be processed as part of
  // cycle creation to create a standy node list.
  saveJoinRequest(payload)

  /* prettier-ignore */ nestedCountersInstance.countEvent( 'p2p', `join-gossip: request saved and gossiped` )
  Comms.sendGossip(
    'gossip-valid-join-requests',
    payload,
    tracker,
    sender,
    [...NodeList.activeByIdOrder, ...NodeList.readyByTimeAndIdOrder],
    false
  )
}

const gossipUnjoinRequests: P2P.P2PTypes.GossipHandler<UnjoinRequest, P2P.NodeListTypes.Node['id']> = (
  payload: UnjoinRequest,
  sender: P2P.NodeListTypes.Node['id'],
  tracker: string
) => {
  const processResult = processNewUnjoinRequest(payload)
  if (processResult.isErr()) {
    warn(`gossip-unjoin failed to process unjoin request: ${processResult.error}`)
    return
  }

  Comms.sendGossip(
    'gossip-unjoin',
    payload,
    tracker,
    sender,
    [...NodeList.activeByIdOrder, ...NodeList.readyByTimeAndIdOrder],
    false
  )
}

const gossipSyncStartedRoute: P2P.P2PTypes.GossipHandler<
  StartedSyncingRequest,
  P2P.NodeListTypes.Node['id']
> = (payload, sender, tracker) => {
  if (config.debug.cycleRecordOOSDebugLogs) console.log('DEBUG CR-OOS: CycleChain.newest.counter: ', CycleChain.newest.counter)

  if (config.debug.cycleRecordOOSDebugLogs) {
    if (receivedSyncStarted.has(payload.nodeId) === false) {
      receivedSyncStarted.set(payload.nodeId, true)
      const sendingNode = NodeList.byIdOrder.find((node) => node.id === sender)
      console.log(
        'DEBUG CR-OOS: STARTED_SYNCING: ',
        ' sender ',
        sendingNode.externalPort,
        ' payload id: ',
        payload.nodeId,
        ' payload cycle: ',
        payload.cycleNumber,
        'cC: ',
        CycleCreator.currentCycle,
        ' cQ: ',
        CycleCreator.currentQuarter
      )
    }
  }

  profilerInstance.scopedProfileSectionStart('gossip-sync-started')
  nestedCountersInstance.countEvent('p2p', `received gossip-sync-started`)
  /* prettier-ignore */ if (logFlags.verbose) console.log(`received gossip-sync-started`)
  try {
    if (!payload) {
      warn('No payload provided for the `SyncStarted` request.')
      return
    }
    // Do not forward gossip after quarter 2
    if (CycleCreator.currentQuarter >= 3) {
      if (config.debug.cycleRecordOOSDebugLogs)
        console.log(
          'DEBUG CR-OOS: STARTED_SYNCING: gossipSyncFinished rejected: cC: ',
          CycleCreator.currentCycle,
          ' cQ: ',
          CycleCreator.currentQuarter,
          ' payload id: ',
          payload.nodeId,
          ' payload cycle: ',
          payload.cycleNumber
        )
      return
    }

    //  Validate of payload is done in addSyncStarted
    const addSyncStartedResult = addSyncStarted(payload)
    nestedCountersInstance.countEvent(
      'p2p',
      `sync-started validation success: ${addSyncStartedResult.success}`
    )
    /* prettier-ignore */ if (logFlags.verbose) console.log(`sync-started validation success: ${addSyncStartedResult.success}`)
    if (!addSyncStartedResult.success) {
      if (addSyncStartedResult.reason !== 'node has already submitted syncStarted request') {
        if (config.debug.cycleRecordOOSDebugLogs)
          console.log(
            'DEBUG CR-OOS: STARTED_SYNCING: gossipSyncFinished rejected: ',
            addSyncStartedResult.reason,
            ' payload id: ',
            payload.nodeId,
            ' payload cycle: ',
            payload.cycleNumber
          )
      }
      nestedCountersInstance.countEvent('p2p', `sync-started failure reason: ${addSyncStartedResult.reason}`)
    }
    /* prettier-ignore */ if (logFlags.verbose && !addSyncStartedResult.success) console.log(`sync-started validation reason: ${addSyncStartedResult.reason}`)
    if (addSyncStartedResult.success)
      Comms.sendGossip(
        'gossip-sync-started',
        payload,
        tracker,
        sender,
        [...NodeList.activeByIdOrder, ...NodeList.readyByTimeAndIdOrder],
        false
      )
  } finally {
    profilerInstance.scopedProfileSectionEnd('gossip-sync-started')
  }
}

/**
 * Handler for syncing finished gossip. Gossip coming from Join Protocol v2 in `enterSyncingState()` of startupV2 in Self.ts and the function below.
 */
const gossipSyncFinishedRoute: P2P.P2PTypes.GossipHandler<
  P2P.JoinTypes.FinishedSyncingRequest,
  P2P.NodeListTypes.Node['id']
> = (
  payload: P2P.JoinTypes.FinishedSyncingRequest,
  sender: P2P.NodeListTypes.Node['id'],
  tracker: string
) => {
  profilerInstance.scopedProfileSectionStart('gossip-sync-finished')

  if (config.debug.cycleRecordOOSDebugLogs) console.log('DEBUG CR-OOS: CycleChain.newest.counter: ', CycleChain.newest.counter)

  if (config.debug.cycleRecordOOSDebugLogs) {
    if (receivedSyncFinished.has(payload.nodeId) === false) {
      receivedSyncFinished.set(payload.nodeId, true)
      const sendingNode = NodeList.byIdOrder.find((node) => node.id === sender)
      console.log(
        'DEBUG CR-OOS: FINISHED_SYNCING:',
        ' sender ',
        sendingNode.externalPort,
        'payload id: ',
        payload.nodeId,
        ' payload cycle: ',
        payload.cycleNumber,
        'cC: ',
        CycleCreator.currentCycle,
        ' cQ: ',
        CycleCreator.currentQuarter
      )
    }
  }

  try {
    // Do not forward gossip after quarter 2
    if (CycleCreator.currentQuarter >= 3) {
      if (config.debug.cycleRecordOOSDebugLogs)
        console.log(
          'DEBUG CR-OOS: FINISHED_SYNCING: gossipSyncFinished rejected: cC: ',
          CycleCreator.currentCycle,
          ' cQ: ',
          CycleCreator.currentQuarter,
          ' payload id: ',
          payload.nodeId,
          ' payload cycle: ',
          payload.cycleNumber
        )
      nestedCountersInstance.countEvent(
        'p2p',
        `gossipSyncFinished rejected: cC: ${CycleCreator.currentCycle} cQ: ${CycleCreator.currentQuarter} payload id: ${payload.nodeId} payload cycle: ${payload.cycleNumber}`
      )
      /* prettier-ignore */ if (logFlags.p2pNonFatal && logFlags.console) console.log('gossipSyncFinished rejected: due to currentQuarter >= 3', payload.nodeId, CycleCreator.currentQuarter)
      return
    }

    /* prettier-ignore */ if (logFlags.p2pNonFatal && logFlags.console) console.log('gossipSyncFinishedRoute: after quarter check')

    // Validate payload in addFinishedSyncing
    const addFinishedSyncingResult = addFinishedSyncing(payload)
    nestedCountersInstance.countEvent(
      'p2p',
      `sync-finished validation success: ${addFinishedSyncingResult.success}`
    )
    if (!addFinishedSyncingResult.success) {
      if (addFinishedSyncingResult.reason !== 'node has already submitted syncFinished request') {
        if (config.debug.cycleRecordOOSDebugLogs)
          console.log(
            'DEBUG CR-OOS: FINISHED_SYNCING: gossipSyncFinished rejected: ',
            addFinishedSyncingResult.reason,
            ' payload id: ',
            payload.nodeId,
            ' payload cycle: ',
            payload.cycleNumber
          )
      }
      nestedCountersInstance.countEvent(
        'p2p',
        `sync-finished failure reason: ${addFinishedSyncingResult.reason}`
      )
    }
    if (addFinishedSyncingResult.success) {
      Comms.sendGossip(
        'gossip-sync-finished',
        payload,
        tracker,
        sender,
        [...NodeList.activeByIdOrder, ...NodeList.readyByTimeAndIdOrder],
        false
      )
    } else {
      /* prettier-ignore */ if (logFlags.p2pNonFatal && logFlags.console) console.log(`gossipSyncFinishedRoute: addFinishedSyncing failed: ${addFinishedSyncingResult.reason} fatal:${addFinishedSyncingResult.fatal} node:${payload.nodeId} cycle:${payload.cycleNumber}`)
    }
  } finally {
    profilerInstance.scopedProfileSectionEnd('gossip-sync-finished')
  }
}

const gossipStandbyRefresh: P2P.P2PTypes.GossipHandler<
  P2P.JoinTypes.StandbyRefreshRequest,
  P2P.NodeListTypes.Node['id']
> = async (payload, sender, tracker) => {
  profilerInstance.scopedProfileSectionStart('gossip-standby-refresh')
  nestedCountersInstance.countEvent('p2p', `received gossip-standby-refresh`)
  /* prettier-ignore */ if (logFlags.verbose) console.log(`received gossip-standby-refresh`)
  try {
    //if (logFlags.p2pNonFatal) info(`Got scale request: ${JSON.stringify(payload)}`)
    if (!payload) {
      warn('No payload provided for the `StandbyRefreshRequest` request.')
      return
    }
    if (CycleCreator.currentQuarter >= 3) return

    const added = addStandbyRefresh(payload)
    nestedCountersInstance.countEvent('p2p', `standby-refresh validation success: ${added.success}`)
    /* prettier-ignore */ if (logFlags.verbose) console.log(`standby-refresh validation success: ${added.success}`)
    if (!added.success)
      nestedCountersInstance.countEvent('p2p', `standby-refresh failure reason: ${added.reason}`)
    /* prettier-ignore */ if (logFlags.verbose && !added.success) console.log(`standby-refresh validation reason: ${added.reason}`)
    if (added.success)
      Comms.sendGossip(
        'gossip-standby-refresh',
        payload,
        tracker,
        sender,
        [...NodeList.activeByIdOrder, ...NodeList.readyByTimeAndIdOrder],
        false
      )
  } finally {
    profilerInstance.scopedProfileSectionEnd('gossip-standby-refresh')
  }
}


export const routes = {
  external: [cycleMarkerRoute, joinRoute, joinedRoute, joinedV2Route, acceptedRoute, unjoinRoute, standbyRefreshRoute],
  gossip: {
    'gossip-join': gossipJoinRoute,
    'gossip-valid-join-requests': gossipValidJoinRequests,
    'gossip-unjoin': gossipUnjoinRequests,
    'gossip-sync-started': gossipSyncStartedRoute,
    'gossip-sync-finished': gossipSyncFinishedRoute,
    'gossip-standby-refresh' : gossipStandbyRefresh,
  },
}

const receivedSyncStarted = new Map<string, boolean>()
const receivedSyncFinished = new Map<string, boolean>()
const receivedJoin = new Map<string, boolean>()
