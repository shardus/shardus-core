
import * as NodeList from './NodeList'
import * as Self from './Self'
import { enterRecovery, enterSafety, enterProcessing } from './Modes'
import { config } from './Context'
import { targetCount } from './CycleAutoScale'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { P2P } from '@shardus/types'
import { insertSorted, lerp } from '../utils'
import * as CycleCreator from './CycleCreator'
import * as CycleChain from './CycleChain'

export function calculateToAcceptV2(prevRecord: P2P.CycleCreatorTypes.CycleRecord) {
  const active = NodeList.activeByIdOrder.length
  const syncing = NodeList.byJoinOrder.length - NodeList.activeByIdOrder.length
  // For now, we are using the desired value from the previous cycle. In the future, we should look at using the next desired value
  const desired = prevRecord.desired
  const target = targetCount

  nestedCountersInstance.countEvent('shardeum-mode', `desired: ${desired}, target: ${target}, active: ${active}, syncing: ${syncing}`)

  let add = 0
  let remove = 0
  if (prevRecord) {
    if (prevRecord.mode === 'forming') {
      if (Self.isFirst && active < 1) {
        add = target
        remove = 0
        return { add, remove }
      } else if (active != desired) {
        let addRem = target - (active + syncing)
        if (addRem > 0) {
          add = Math.ceil(addRem)
          remove = 0
          return { add, remove }
        }
        if (addRem < 0) {
          addRem = active - target
          if (addRem > 0) {
            if (addRem > 0.1 * active) {
              addRem = 0.1 * active
            }
            if (addRem < 1) {
              addRem = 1
            }

            add = 0
            remove = Math.ceil(addRem)
            return { add, remove }
          }
        }
      }
    } else if (prevRecord.mode === 'processing') {
      if (enterSafety(active, prevRecord) === false && enterRecovery(active) === false) {
        if (active !== ~~target) {
          // calculate nodes to add or remove
          let addRem = target - (active + syncing)
          if (addRem > 0) {
            if (addRem > active * 0.1) { // limit nodes added to 10% of active; we are here because many were lost
              addRem = ~~(active * 0.1)
              if (addRem === 0) {
                addRem = 1
              }
            }

            add = Math.ceil(addRem)
            remove = 0
            return { add, remove }
          }
          if (addRem < 0) {
            addRem = active - target   // only remove the active nodes more than target
            if (addRem > active * 0.05) { // limit nodes removed to 5% of active; this should not happen
              console.log("unexpected addRem > 5% of active", addRem, active, target, desired)
              addRem = ~~(active * 0.05)
              if (addRem === 0) {
                addRem = 1
              }
            }
            if (addRem > 0) {
              if (addRem > active * 0.05) { // don't ever remove more than 10% of active per cycle
                addRem = active * 0.05
              }
              if (addRem < 1) {
                addRem = 1
              }
              add = 0
              remove = Math.ceil(addRem)
              return { add, remove }
            }
          }
        } else if (config.p2p.maxRotatedPerCycle !== 0) {
          let rnum = config.p2p.maxRotatedPerCycle // num to rotate per cycle; can be less than 1; like 0.5 for every other cycle; -1 for auto
          if (rnum < 0) { // rotate all nodes in 1000 cycles
            rnum = active * 0.001 
          }  
          if (rnum < 1) {
            if (prevRecord.counter % (1/rnum) === 0) { // rotate every few cycles if less than 1000 nodes
              rnum = 1 
            }  
            else { 
              rnum = 0 
            }
          }
          if (rnum > 0){
            if (rnum > active * 0.001) { 
              rnum = ~~(active * 0.001)
              if (rnum < 1) { 
                rnum = 1
              }
            }
            add = Math.ceil(rnum)
            remove = 0
          }
          return { add, remove }
        }
      }
    } else if (prevRecord.mode === 'safety') {
      if (enterProcessing(active) === false && enterRecovery(active) === false) {
        let addRem = 1.02 * config.p2p.minNodes - (active + syncing) // we try to overshoot min value by 2%; for slow syncing nodes
        if (addRem > active * 0.05) {
          addRem = ~~(active * 0.05)
          if (addRem === 0) {
            addRem = 1
          }
        }
        addRem += prevRecord.lost.length  // compensate for nodes that were lost; though this could add more burden on existing nodes
        if (addRem > 0) {
          add = Math.ceil(addRem)
          remove = 0
          return { add, remove }
        }
      }
    } else if (prevRecord.mode === 'recovery') {
      if (enterSafety(active, prevRecord) === false) {
        let addRem = 0.62 * config.p2p.minNodes - (active + syncing) // we try to overshoot min value by 2%; for slow syncing nodes
        if (addRem > active * 0.1) { // we really should be looking at how many archivers are available to sync from
          addRem = ~~(active * 0.1)
          if (addRem === 0) {
            addRem = 1
          }
        }
        if (addRem > 0) {
          add = Math.ceil(addRem)
          remove = 0
          return { add, remove }
        }
      }
    }
  }
  return { add, remove }
}


/** Returns the number of expired nodes and the list of removed nodes using calculateToAcceptV2 */
export function getExpiredRemovedV2(
  prevRecord: P2P.CycleCreatorTypes.CycleRecord,
  lastLoggedCycle: number,
  txs: P2P.RotationTypes.Txs & P2P.ApoptosisTypes.Txs,
  info: (...msg: string[]) => void
): { expired: number; removed: string[] } {
  const start = prevRecord.start
  let expired = 0
  const removed = []
  NodeList.potentiallyRemoved.clear()

  // Don't expire/remove any if nodeExpiryAge is negative
  if (config.p2p.nodeExpiryAge < 0) return { expired, removed }

  const active = NodeList.activeByIdOrder.length

  let expireTimestamp = (start - config.p2p.nodeExpiryAge) * 1000
  if (expireTimestamp < 0) expireTimestamp = 0

  // calculate the target number of nodes
  const { add, remove } = calculateToAcceptV2(prevRecord)
  nestedCountersInstance.countEvent('p2p', `results of getExpiredRemovedV2.calculateToAcceptV2: add: ${add}, remove: ${remove}`)
  let maxRemove = remove

  const cycle = CycleChain.newest.counter
  if (cycle > lastLoggedCycle && maxRemove > 0) {
    lastLoggedCycle = cycle
    info(
      'scale down dump:' +
        JSON.stringify({
          cycle,
          scaleFactor: CycleCreator.scaleFactor,
          desired: prevRecord.desired,
          active,
          maxRemove,
          expired,
        })
    )
  }

  nestedCountersInstance.countEvent('p2p', `results of getExpiredRemovedV2: scaleDownRemove: maxRemove: ${maxRemove}`)
  // get list of nodes that have been requested to be removed
  const apoptosizedNodesList = []
  for (const request of txs.apoptosis) {
    const node = NodeList.nodes.get(request.id)
    if (node) {
      apoptosizedNodesList.push(node.id)
    }
  }

  // Oldest node has index 0
  for (const node of NodeList.byJoinOrder) {
    // don't count syncing nodes in our expired count
    if (node.status === 'syncing') continue

    // once we've hit the first node that's not expired, stop counting
    if (node.joinRequestTimestamp > expireTimestamp) break

    // otherwise, count this node as expired
    expired++

    // Add it to removed if it isn't full
    if (config.p2p.uniqueRemovedIds) {
      // Limit the number of nodes that can be removed by removed + apoptosized
      if (removed.length + apoptosizedNodesList.length < maxRemove) {
        NodeList.potentiallyRemoved.add(node.id)
        if (!apoptosizedNodesList.includes(node.id)) {
          insertSorted(removed, node.id)
        }
      } else break
    } else {
      if (removed.length < maxRemove) {
        NodeList.potentiallyRemoved.add(node.id)
        insertSorted(removed, node.id)
      }
    }
  }

  return { expired, removed }
}
