import { Logger } from 'log4js'
import { stringify } from 'shardus-crypto-utils'
import {
  binarySearch,
  insertSorted,
  propComparator,
  propComparator2,
  stringifyReduce
} from '../utils'
import { crypto, logger,config } from './Context'
import * as CycleChain from './CycleChain'
import { JoinedConsensor } from './Join'
import { id } from './Self'
import { NodeStatus } from './Types'
import deepmerge = require('deepmerge')

/** TYPES */

type Diff<T, U> = T extends U ? never : T

type OptionalExceptFor<T, TRequired extends keyof T> = Partial<T> &
  Pick<T, TRequired>

type RequiredExceptFor<T, TOptional extends keyof T> = Pick<
  T,
  Diff<keyof T, TOptional>
> &
  Partial<T>

export interface Node extends JoinedConsensor {
  curvePublicKey: string
  status: NodeStatus
}

export type Update = OptionalExceptFor<Node, 'id'>

/** STATE */

let p2pLogger: Logger

export let nodes: Map<Node['id'], Node> // In order of joinRequestTimestamp [OLD, ..., NEW]
export let byPubKey: Map<Node['publicKey'], Node>
export let byIpPort: Map<string, Node>
export let byJoinOrder: Node[] // In order of joinRequestTimestamp [OLD, ..., NEW]
export let byIdOrder: Node[]
export let othersByIdOrder: Node[] // used by sendGossipIn
export let activeByIdOrder: Node[]
export let activeOthersByIdOrder: Node[]

const VERBOSE = false    // Use to dump complete NodeList and CycleChain data
const  mainLogger = logger.getLogger('main')

reset()

/** FUNCTIONS */

export function init() {
  p2pLogger = logger.getLogger('p2p')
}

export function reset() {
  nodes = new Map()
  byPubKey = new Map()
  byIpPort = new Map()
  byJoinOrder = []
  byIdOrder = []
  othersByIdOrder = []
  activeByIdOrder = []
  activeOthersByIdOrder = []
}

export function addNode(node: Node) {
  // Don't add duplicates
  if (nodes.has(node.id)) {
    warn(
      `NodeList.addNode: tried to add duplicate ${
        node.externalPort
      }: ${stringify(node)}\n` + `${new Error().stack}`
    )

    return
  }

  nodes.set(node.id, node)
  byPubKey.set(node.publicKey, node)
  byIpPort.set(ipPort(node.internalIp, node.internalPort), node)

  // Insert sorted by joinRequestTimstamp into byJoinOrder
  insertSorted(byJoinOrder, node, propComparator2('joinRequestTimestamp', 'id'))

  // Insert sorted by id into byIdOrder
  insertSorted(byIdOrder, node, propComparator('id'))

  // Dont insert yourself into othersbyIdOrder
  if (node.id !== id) {
    insertSorted(othersByIdOrder, node, propComparator('id'))
  }

  // If active, insert sorted by id into activeByIdOrder
  if (node.status === NodeStatus.ACTIVE) {
    insertSorted(activeByIdOrder, node, propComparator('id'))

    // Dont insert yourself into activeOthersByIdOrder
    if (node.id !== id) {
      insertSorted(activeOthersByIdOrder, node, propComparator('id'))
    }
  }
}
export function addNodes(newNodes: Node[]) {
  for (const node of newNodes) addNode(node)
}

export function removeNode(id) {
  let idx

  // Omar added this so we don't crash if a node gets remove more than once
  if (!nodes.has(id)){
    console.log('Tried to delete a node that is not in the nodes list.', id)
    console.trace()
    return 
  } 

  // Remove from arrays
  idx = binarySearch(activeOthersByIdOrder, { id }, propComparator('id'))
  if (idx >= 0) activeOthersByIdOrder.splice(idx, 1)

  idx = binarySearch(activeByIdOrder, { id }, propComparator('id'))
  if (idx >= 0) activeByIdOrder.splice(idx, 1)

  idx = binarySearch(othersByIdOrder, { id }, propComparator('id'))
  if (idx >= 0) othersByIdOrder.splice(idx, 1)

  idx = binarySearch(byIdOrder, { id }, propComparator('id'))
  if (idx >= 0) byIdOrder.splice(idx, 1)

  const joinRequestTimestamp = nodes.get(id).joinRequestTimestamp
  idx = binarySearch(
    byJoinOrder,
    { joinRequestTimestamp, id },
    propComparator2('joinRequestTimestamp', 'id')
  )
  if (idx >= 0) byJoinOrder.splice(idx, 1)

  // Remove from maps
  const node = nodes.get(id)
  byIpPort.delete(ipPort(node.internalIp, node.internalPort))
  byPubKey.delete(node.publicKey)
  nodes.delete(id)
}
export function removeNodes(ids: string[]) {
  for (const id of ids) removeNode(id)
}

export function updateNode(update: Update) {
  const node = nodes.get(update.id)
  if (node) {
    // Update node properties
    for (const key of Object.keys(update)) {
      node[key] = update[key]
    }

    // Add the node to active arrays, if needed
    if (update.status === NodeStatus.ACTIVE) {
      insertSorted(activeByIdOrder, node, propComparator('id'))
      // Don't add yourself to
      if (node.id !== id) {
        insertSorted(activeOthersByIdOrder, node, propComparator('id'))
      }
    }
  }
}
export function updateNodes(updates: Update[]) {
  for (const update of updates) updateNode(update)
}

export function createNode(joined: JoinedConsensor) {
  const node: Node = {
    ...joined,
    curvePublicKey: crypto.convertPublicKeyToCurve(joined.publicKey),
    status: NodeStatus.SYNCING,
  }

  return node
}

export function getActiveNodes(selfExclude = false) {
  if(selfExclude) return activeOthersByIdOrder
  else return activeByIdOrder
}

export function getNodeByPubKey(publicKey) {
  const node = byPubKey.get(publicKey)
  if (!node) {
    mainLogger.debug(`Node not found for given public key: ${publicKey}...`)
    return null
  }
  return node
}

export function getOrderedSyncingNeighbors(node) {
  let index = this._getNodeAddressOrderedIndex(node)
  let results = []

  try {
    if (index === false) {
      console.log(`getOrderedSyncingNeighbors failed to find ${stringifyReduce(node.id)}`)

      if (nodes != null && othersByIdOrder != null) {
        const ordered = othersByIdOrder
        let orderedString = `---orderedNodes ${stringifyReduce(ordered.map((a) => a.id))}`
        console.log(orderedString)

        mainLogger.error(`getOrderedSyncingNeighbors failed to find ${stringifyReduce(node.id)} nodeList:${orderedString} stack: ${new Error().stack}`)
      } else {
        mainLogger.error(`getOrderedSyncingNeighbors failed to find ${stringifyReduce(node.id)} nodeList: not available stack: ${new Error().stack}`)
      }
      return results
    }
  } catch (err) {
    console.log(err.stack)
  }
  // cycleShardData.activeNodes.sort(function (a, b) { return a.id === b.id ? 0 : a.id < b.id ? -1 : 1 })
  // console.log(`getOrderedSyncingNeighbors find: ${utils.stringifyReduce(node.id)} index: ${index} all:  ${utils.stringifyReduce(othersByIdOrder.map(node => utils.makeShortHash(node.id) + ':' + node.externalPort))}`)

  // @ts-ignore
  let leftIndex = index - 1
  // @ts-ignore
  let rightIndex = index + 1

  if (leftIndex < 0) {
    leftIndex = othersByIdOrder.length - 1
  }
  if (rightIndex >= othersByIdOrder.length) {
    rightIndex = 0
  }

  if (leftIndex !== index) {
    let node = othersByIdOrder[leftIndex]
    while (node.status === 'syncing') {
      results.push(node)
      leftIndex--
      if (leftIndex < 0) {
        leftIndex = othersByIdOrder.length - 1
      }
      if (leftIndex === index) {
        break
      }
      node = othersByIdOrder[leftIndex]
    }
  }
  if (rightIndex !== index) {
    let node = othersByIdOrder[rightIndex]
    while (node.status === 'syncing') {
      results.push(node)
      rightIndex++
      if (rightIndex >= othersByIdOrder.length) {
        rightIndex = 0
      }
      if (rightIndex === index) {
        break
      }
      node = othersByIdOrder[rightIndex]
    }
  }

  // if (results.length > 0) {
  //   console.log(`getOrderedSyncingNeighbors find: our node: ${utils.stringifyReduce(node.id)} syncing neighbors:  ${utils.stringifyReduce(results.map(node => utils.makeShortHash(node.id) + ':' + node.externalPort))}`)
  // }

  // todo what about two nodes syncing next to each other.  should we keep expanding to catch runs of syncing nodes.
  return results
}

export function allowTransactions() {
return activeByIdOrder.length >= config.p2p.minNodesToAllowTxs
}

export function allowSet() {
  return activeByIdOrder.length === 1
}


export function ipPort(ip: string, port: number) {
  return ip + ':' + port
}

function idTrim(id){ return id.substr(0,3) }

export function getDebug() {
  let output = `
    NODES:
      hash:                  ${crypto.hash(byJoinOrder).slice(0, 5)}
      byJoinOrder:           [${byJoinOrder
        .map(node => `${node.externalPort}:${node.counterRefreshed}`)
        .join()}]
      byIdOrder:             [${byIdOrder
        .map(node => ''+node.externalPort+':x'+idTrim(node.id))
        .join()}]
      othersByIdOrder:       [${othersByIdOrder.map(node => node.externalPort)}]
      activeByIdOrder:       [${activeByIdOrder.map(node => node.externalPort)}]
      activeOthersByIdOrder: [${activeOthersByIdOrder.map(
        node => node.externalPort
      )}]
      `
      if (VERBOSE) output += `
    NODELIST:   ${stringify(byJoinOrder)}
    CYCLECHAIN: ${stringify(CycleChain.cycles)}
  `
  return output
}

/** ROUTES */

function info(...msg) {
  const entry = `Refresh: ${msg.join(' ')}`
  p2pLogger.info(entry)
}

function warn(...msg) {
  const entry = `Refresh: ${msg.join(' ')}`
  p2pLogger.warn(entry)
}

function error(...msg) {
  const entry = `Refresh: ${msg.join(' ')}`
  p2pLogger.error(entry)
}
