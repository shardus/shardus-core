import { P2P } from "@shardus/types";
import * as NodeList from "../NodeList";
import * as Archivers from "../Archivers";
import * as CycleCreator from "../CycleCreator";
import * as CycleChain from "../CycleChain";
import { parse } from "../CycleParser";
import { info, warn } from "./logging";

export function totalNodeCount(cycle: P2P.CycleCreatorTypes.CycleRecord) {
  // we don't count `activated` because it was already counted in syncing
  return (
    cycle.syncing +
    cycle.joinedConsensors.length +
    cycle.active
    - cycle.apoptosized.length
    - cycle.removed.length
  )
}

export function digestCycle(cycle: P2P.CycleCreatorTypes.CycleRecord) {
  // get the node list hashes *before* applying node changes
  cycle.nodeListHash = NodeList.computeNewNodeListHash()
  cycle.archiverListHash = Archivers.computeNewArchiverListHash()

  const marker = CycleCreator.makeCycleMarker(cycle)
  if (CycleChain.cyclesByMarker[marker]) {
    warn(`Tried to digest cycle record twice: ${JSON.stringify(cycle)}\n` + `${new Error().stack}`)
    return
  }

  const changes = parse(cycle)
  applyNodeListChange(changes, true, cycle)

  CycleChain.append(cycle)

  let nodeLimit = 2 //todo set this to a higher number, but for now I want to make sure it works in a small test
  if (NodeList.activeByIdOrder.length <= nodeLimit) {
    info(`
      Digested C${cycle.counter}
        cycle record: ${JSON.stringify(cycle)}
        cycle changes: ${JSON.stringify(changes)}
        node list: ${JSON.stringify([...NodeList.nodes.values()])}
        active nodes: ${JSON.stringify(NodeList.activeByIdOrder)}
    `)
  } else {
    info(`
    Digested C${cycle.counter}
      cycle record: ${JSON.stringify(cycle)}
      cycle changes: ${JSON.stringify(changes)}
      node list: too many to list: ${NodeList.nodes.size}
      active nodes: too many to list: ${NodeList.activeByIdOrder.length}
    `)
  }
}

function applyNodeListChange(
  change: P2P.CycleParserTypes.Change,
  raiseEvents: boolean,
  cycle: P2P.CycleCreatorTypes.CycleRecord | null
) {
  NodeList.addNodes(change.added.map((joined) => NodeList.createNode(joined)))
  NodeList.updateNodes(change.updated, raiseEvents, cycle)
  NodeList.removeNodes(change.removed, raiseEvents, cycle)
}

export function nodeListNodesIntoSyncActiveNodes(nodes: P2P.NodeListTypes.Node[]): P2P.SyncTypes.ActiveNode[] {
  return nodes.map((node) => ({
    ip: node.externalIp,
    port: node.externalPort,
    ...node
  }))
}
