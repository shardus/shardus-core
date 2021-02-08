import { ShardusConfiguration } from '../shardus/shardus-types'
import Shardus = require('../shardus/shardus-types')
import { ShardGlobals, ShardInfo, StoredPartition, NodeShardData, AddressRange, HomeNodeSummary, ParititionShardDataMap, NodeShardDataMap, MergeResults, BasicAddressRange } from './shardFunctionTypes'
import * as utils from '../utils'
const stringify = require('fast-stable-stringify')

import Profiler from '../utils/profiler'
import { P2PModuleContext as P2P } from '../p2p/Context'
import Storage from '../storage'
import Crypto from '../crypto'
import Logger from '../logger'
import ShardFunctions from './shardFunctions2.js'
import { time } from 'console'
import StateManager from '.'

const cHashSetStepSize = 4
const cHashSetTXStepSize = 2
const cHashSetDataStepSize = 2

class Depricated {
  app: Shardus.App
  crypto: Crypto
  config: Shardus.ShardusConfiguration
  profiler: Profiler
  verboseLogs: boolean
  logger: Logger
  p2p: P2P
  storage: Storage
  stateManager: StateManager

  mainLogger: any
  fatalLogger: any
  shardLogger: any
  statsLogger: any
  statemanager_fatal: (key: string, log: string) => void

  sentReceipts: Map<string, boolean>
  sendArchiveData: boolean
  purgeArchiveData: boolean

  /** tracks state for repairing partitions. index by cycle counter key to get the repair object, index by parition  */
  repairTrackingByCycleById: { [cycleKey: string]: { [id: string]: RepairTracker } }
  /** UpdateRepairData by cycle key */
  repairUpdateDataByCycle: { [cycleKey: string]: UpdateRepairData[] }

  applyAllPreparedRepairsRunning: boolean

  repairStartedMap: Map<string, boolean>
  repairCompletedMap: Map<string, boolean>
  dataRepairStack: RepairTracker[]

  constructor(stateManager: StateManager, verboseLogs: boolean, profiler: Profiler, app: Shardus.App, logger: Logger, storage: Storage, p2p: P2P, crypto: Crypto, config: Shardus.ShardusConfiguration) {
    this.verboseLogs = verboseLogs
    this.crypto = crypto
    this.app = app
    this.logger = logger
    this.config = config
    this.profiler = profiler
    this.p2p = p2p
    this.storage = storage
    this.stateManager = stateManager

    this.mainLogger = logger.getLogger('main')
    this.fatalLogger = logger.getLogger('fatal')
    this.shardLogger = logger.getLogger('shardDump')
    this.statsLogger = logger.getLogger('statsDump')
    this.statemanager_fatal = stateManager.statemanager_fatal

    this.sentReceipts = new Map()

    this.sendArchiveData = false
    this.purgeArchiveData = false

    this.repairTrackingByCycleById = {}
    this.repairUpdateDataByCycle = {}
    this.applyAllPreparedRepairsRunning = false

    this.repairStartedMap = new Map()
    this.repairCompletedMap = new Map()
    this.dataRepairStack = []
  }

  setupHandlers() {
    // After joining the network
    //   Record Joined timestamp
    //   Even a syncing node will receive accepted transactions
    //   Starts receiving accepted transaction and saving them to Accepted Tx Table
    this.p2p.registerGossipHandler('acceptedTx', async (acceptedTX: AcceptedTx, sender: Shardus.Node, tracker: string) => {
      // docs mention putting this in a table but it seems so far that an in memory queue should be ok
      // should we filter, or instead rely on gossip in to only give us TXs that matter to us?

      this.p2p.sendGossipIn('acceptedTx', acceptedTX, tracker, sender)

      let noConsensus = false // this can only be true for a set command which will never come from an endpoint
      this.stateManager.transactionQueue.routeAndQueueAcceptedTransaction(acceptedTX, /*sendGossip*/ false, sender, /*globalModification*/ false, noConsensus)
      //Note await not needed so beware if you add code below this.
    })
  }

  // MAYBE WE DO NEED THIS?

  /**
   * findMostCommonResponse
   * @param {number} cycleNumber
   * @param {number} partitionId
   * @param {string[]} ignoreList currently unused and broken todo resolve this.
   * @return {{topHash: string, topCount: number, topResult: PartitionResult}}
   */
  findMostCommonResponse(cycleNumber: number, partitionId: number, ignoreList: string[]): { topHash: string | null; topCount: number; topResult: PartitionResult | null } {
    let key = 'c' + cycleNumber
    let responsesById = this.stateManager.partitionObjects.allPartitionResponsesByCycleByPartition[key]
    let key2 = 'p' + partitionId
    let responses = responsesById[key2]

    let hashCounting: StringNumberObjectMap = {}
    let topHash = null
    let topCount = 0
    let topResult = null
    if (responses.length > 0) {
      for (let partitionResult of responses) {
        let hash = partitionResult.Partition_hash
        let count = hashCounting[hash] || 0
        count++
        hashCounting[hash] = count
        if (count > topCount) {
          topCount = count
          topHash = hash
          topResult = partitionResult
        }
      }
    }
    // reaponsesById: ${utils.stringifyReduce(responsesById)}
    if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair findMostCommonResponse: retVal: ${utils.stringifyReduce({ topHash, topCount, topResult })}  responses: ${utils.stringifyReduce(responses)} `)
    return { topHash, topCount, topResult }
  }

  // vote rate set to 0.5 / 0.8 => 0.625
  /**
   * solveHashSets
   * @param {GenericHashSetEntry[]} hashSetList
   * @param {number} lookAhead
   * @param {number} voteRate
   * @param {string[]} prevOutput
   * @returns {string[]}
   */
  static solveHashSets(hashSetList: GenericHashSetEntry[], lookAhead: number = 10, voteRate: number = 0.625, prevOutput: string[] | null = null): string[] {
    let output = []
    let outputVotes = []
    let solving = true
    let index = 0
    let lastOutputCount = 0 // output list length last time we went through the loop
    let stepSize = cHashSetStepSize

    let totalVotePower = 0
    for (let hashListEntry of hashSetList) {
      totalVotePower += hashListEntry.votePower
    }
    let votesRequired = voteRate * Math.ceil(totalVotePower)

    let maxElements = 0
    for (let hashListEntry of hashSetList) {
      maxElements = Math.max(maxElements, hashListEntry.hashSet.length / stepSize)
    }

    while (solving) {
      let votes: StringCountEntryObjectMap = {}
      let topVote: Vote = { v: '', count: 0, vote: undefined, ec: undefined }
      let winnerFound = false
      let totalVotes = 0
      // Loop through each entry list
      for (let hashListIndex = 0; hashListIndex < hashSetList.length; hashListIndex++) {
        // if we are already past the end of this entry list then skip
        let hashListEntry = hashSetList[hashListIndex]
        if ((index + hashListEntry.indexOffset + 1) * stepSize > hashListEntry.hashSet.length) {
          continue
        }
        // don't remember what this bail condition was.
        let sliceStart = (index + hashListEntry.indexOffset) * stepSize
        let v = hashListEntry.hashSet.slice(sliceStart, sliceStart + stepSize)
        if (v === '') {
          continue
        }
        // place votes for this value
        let countEntry: CountEntry = votes[v] || { count: 0, ec: 0, voters: [] }
        totalVotes += hashListEntry.votePower
        countEntry.count += hashListEntry.votePower
        countEntry.voters.push(hashListIndex)
        votes[v] = countEntry
        if (countEntry.count > topVote.count) {
          topVote.count = countEntry.count
          topVote.v = v
          topVote.vote = countEntry
        }
        hashListEntry.lastValue = v
      }

      // if totalVotes < votesRequired then we are past hope of approving any more messages... I think.  I guess there are some cases where we could look back and approve one more
      if (topVote.count === 0 || index > maxElements || totalVotes < votesRequired) {
        solving = false
        break
      }
      // can we find a winner in a simple way where there was a winner based on the next item to look at in all the arrays.
      if (topVote.count >= votesRequired) {
        winnerFound = true
        output.push(topVote.v)
        outputVotes.push(topVote)
        // corrections for chains that do not match our top vote.
        for (let k = 0; k < hashSetList.length; k++) {
          let hashListEntryOther = hashSetList[k]
          if (hashListEntryOther.lastValue === topVote.v) {
            hashListEntryOther.errorStack = []
          }
        }
      }

      // Leaving this here, because it is a good spot to put a breakpoint when testing a data set where stuf went wrong (hashset.js)
      // if (index === 123) {
      //   let foo = 5
      //   foo++
      // }

      // for (let hashListEntry of hashSetList) {
      for (let hashListIndex = 0; hashListIndex < hashSetList.length; hashListIndex++) {
        let hashListEntry = hashSetList[hashListIndex]
        // for nodes that did not match the top vote .. or all nodes if no winner yet.
        if (!winnerFound || hashListEntry.lastValue !== topVote.v) {
          // consider removing v..  since if we dont have a winner yet then top vote will get updated in this loop
          hashListEntry.corrections.push({ i: index, tv: topVote, v: topVote.v, t: 'insert', bv: hashListEntry.lastValue, if: lastOutputCount })
          hashListEntry.errorStack.push({ i: index, tv: topVote, v: topVote.v })
          hashListEntry.indexOffset -= 1

          if (hashListEntry.waitForIndex > 0 && index < hashListEntry.waitForIndex) {
            continue
          }

          if (hashListEntry.waitForIndex > 0 && hashListEntry.waitForIndex === index) {
            hashListEntry.waitForIndex = -1
            hashListEntry.waitedForThis = true
          }

          let alreadyVoted: StringBoolObjectMap = {} // has the given node already EC voted for this key?
          // +1 look ahead to see if we can get back on track
          // lookAhead of 0 seems to be more stable
          // let lookAhead = 10 // hashListEntry.errorStack.length
          for (let i = 0; i < hashListEntry.errorStack.length + lookAhead; i++) {
            // using +2 since we just subtracted one from the index offset. anothe r +1 since we want to look ahead of where we just looked
            let thisIndex = index + hashListEntry.indexOffset + i + 2
            let sliceStart = thisIndex * stepSize
            if (sliceStart + 1 > hashListEntry.hashSet.length) {
              continue
            }
            let v = hashListEntry.hashSet.slice(sliceStart, sliceStart + stepSize)
            if (alreadyVoted[v]) {
              continue
            }

            // a hint to stop us from looking ahead too far
            // if (prevOutput && prevOutput[index + i + 2] === v) {
            //   break
            // }

            // scan ahead for other connections
            if (prevOutput && !hashListEntry.waitedForThis) {
              let foundMatch = false
              let searchAhead = 5 // Math.max(10, lookAhead - i)
              for (let k = 1; k < searchAhead; k++) {
                let idx = index + k // + 2 + hashListEntry.indexOffset
                if (prevOutput.length <= idx) {
                  break
                }
                if (prevOutput && prevOutput[idx] === v) {
                  foundMatch = true
                  hashListEntry.waitForIndex = index + k
                  hashListEntry.futureIndex = index + hashListEntry.indexOffset + i + 2
                  hashListEntry.futureValue = v
                }
              }
              if (foundMatch) {
                break
              }
            }

            alreadyVoted[v] = true
            let countEntry: CountEntry = votes[v] || { count: 0, ec: 0, voters: [] } // TSConversion added a missing voters[] object here. looks good to my code inspection but need to validate it with tests!

            // only vote 10 spots ahead
            if (i < 10) {
              countEntry.ec += hashListEntry.votePower
            }

            // check for possible winnner due to re arranging things
            // a nuance here that we require there to be some official votes before in this row before we consider a tx..  will need to analyze this choice
            if (!winnerFound && countEntry.count > 0 && countEntry.ec + countEntry.count >= votesRequired) {
              topVote.ec = countEntry.ec
              topVote.v = v
              topVote.vote = countEntry
              winnerFound = true
              output.push(topVote.v)
              outputVotes.push(topVote)
              // todo roll back corrctions where nodes were already voting for the winner.
              for (let k = 0; k < hashListIndex; k++) {
                let hashListEntryOther = hashSetList[k]
                if (hashListEntryOther.lastValue === topVote.v) {
                  hashListEntryOther.errorStack.pop()
                  hashListEntryOther.corrections.pop()
                  hashListEntryOther.indexOffset++
                }
              }
            }

            if (winnerFound) {
              if (v === topVote.v) {
                if (hashListEntry.waitedForThis) {
                  hashListEntry.waitedForThis = false
                }
                // delete stuff off stack and bail
                // +1 because we at least want to delete 1 entry if index i=0 of this loop gets us here

                /** @type {HashSetEntryCorrection[]} */
                let tempCorrections = []
                // for (let j = 0; j < i + 1; j++) {
                //   let correction = null
                //   //if (i < hashListEntry.errorStack.length)
                //   {
                //     hashListEntry.errorStack.pop()
                //     correction = hashListEntry.corrections.pop()
                //   }
                //   tempCorrections.push({ i: index - j, t: 'extra', c: correction })
                // }
                let index2 = index + hashListEntry.indexOffset + i + 2
                let lastIdx = -1

                for (let j = 0; j < i + 1; j++) {
                  /** @type {HashSetEntryCorrection} */
                  let correction = null
                  if (hashListEntry.errorStack.length > 0) {
                    hashListEntry.errorStack.pop()
                    correction = hashListEntry.corrections.pop()
                  }
                  let extraIdx = j + index2 - (i + 1)
                  if (correction) {
                    extraIdx = correction.i - 1
                    lastIdx = extraIdx
                  } else if (lastIdx > 0) {
                    extraIdx = lastIdx
                  }
                  // correction to fix problem where we were over deleting stuff.
                  // a bit more retroactive than I like.  problem happens in certain cases when there are two winners in a row that are not first pass winners
                  // see 16z for example where this breaks..
                  // if (hashListEntry.corrections.length > 0) {
                  //   let nextCorrection = hashListEntry.corrections[hashListEntry.corrections.length - 1]
                  //   if (nextCorrection && correction && nextCorrection.bv === correction.bv) {
                  //     if (this.verboseLogs) this.mainLogger.debug( ` solveHashSets overdelete fix: i:${i} j:${j} index:${index} bv:${nextCorrection.bv}}`)
                  //     continue
                  //   }
                  // }

                  // hashListEntry.indexOffset++
                  /** @type {HashSetEntryCorrection} */

                  // @ts-ignore  solveHashSets is unused at the moment not going to bother with ts fixup
                  let tempCorrection: HashSetEntryCorrection = { i: extraIdx, t: 'extra', c: correction, hi: index2 - (j + 1), tv: null, v: null, bv: null, if: -1 } // added tv: null, v: null, bv: null, if: -1
                  tempCorrections.push(tempCorrection)
                }

                hashListEntry.corrections = hashListEntry.corrections.concat(tempCorrections)
                // +2 so we can go from being put one behind and go to 1 + i ahead.
                hashListEntry.indexOffset += i + 2

                // hashListEntry.indexOffset += (1)

                hashListEntry.errorStack = [] // clear the error stack
                break
              } else {
                // backfil checking
                // let outputIndex = output.length - 1
                // let tempV = v
                // let stepsBack = 1
                // while (output.length > 0 && outputIndex > 0 && output[outputIndex] === tempV) {
                //   // work backwards through continuous errors and redact them as long as they match up
                //   outputIndex--
                //   stepsBack++
                // }
              }
            }
          }

          if (hashListEntry.waitedForThis) {
            hashListEntry.waitedForThis = false
          }
        }
      }
      index++
      lastOutputCount = output.length
    }

    // trailing extras cleanup.
    for (let hashListIndex = 0; hashListIndex < hashSetList.length; hashListIndex++) {
      let hashListEntry = hashSetList[hashListIndex]

      let extraIdx = index
      while ((extraIdx + hashListEntry.indexOffset) * stepSize < hashListEntry.hashSet.length) {
        let hi = extraIdx + hashListEntry.indexOffset // index2 - (j + 1)
        // @ts-ignore  solveHashSets is unused at the moment not going to bother with ts fixup
        hashListEntry.corrections.push({ i: extraIdx, t: 'extra', c: null, hi: hi, tv: null, v: null, bv: null, if: -1 }) // added , tv: null, v: null, bv: null, if: -1
        extraIdx++
      }
    }

    return output // { output, outputVotes }
  }

  // figures out i A is Greater than B
  // possibly need an alternate version of this solver
  // needs to account for vote power!
  static compareVoteObjects(voteA: ExtendedVote, voteB: ExtendedVote, strict: boolean) {
    // { winIdx: null, val: v, count: 0, ec: 0, lowestIndex: index, voters: [], voteTally: Array(hashSetList.length) }
    // { i: index }

    let agtb = 0
    let bgta = 0

    for (let i = 0; i < voteA.voteTally.length; i++) {
      let vtA = voteA.voteTally[i]
      let vtB = voteB.voteTally[i]
      if (vtA != null && vtB != null) {
        if (vtA.i > vtB.i) {
          agtb += vtA.p // vote power.  note A and B are the same node so power will be equal.
        }
        if (vtB.i > vtA.i) {
          bgta += vtB.p // vote power.
        }
      }
    }
    // what to do with strict.
    if (strict && agtb > 0) {
      return 1
    }

    //return agtb - bgta

    return utils.sortAsc(agtb, bgta)

    // what to return?
  }

  // static compareVoteObjects2 (voteA, voteB, strict) {
  //   // return voteB.votesseen - voteA.votesseen
  //   return voteA.votesseen - voteB.votesseen
  // }

  // when sorting / computing need to figure out if pinning will short cirquit another vote.
  // at the moment this seems

  // vote rate set to 0.5 / 0.8 => 0.625
  /**
   * solveHashSets
   * @param {GenericHashSetEntry[]} hashSetList
   * @param {number} lookAhead
   * @param {number} voteRate
   *
   * @returns {string[]}
   */
  static solveHashSets2(hashSetList: GenericHashSetEntry[], lookAhead: number = 10, voteRate: number = 0.625): string[] {
    let output: string[] = []
    // let outputVotes = []
    let solving = true
    let index = 0
    let stepSize = cHashSetStepSize

    let totalVotePower = 0
    for (let hashListEntry of hashSetList) {
      totalVotePower += hashListEntry.votePower
      // init the pinIdx
      hashListEntry.pinIdx = -1
      hashListEntry.pinObj = null
    }
    let votesRequired = voteRate * Math.ceil(totalVotePower)

    let maxElements = 0
    for (let hashListEntry of hashSetList) {
      maxElements = Math.max(maxElements, hashListEntry.hashSet.length / stepSize)
    }

    // todo backtrack each vote. list of what vote cast at each step.
    // solve this for only one object... or solve for all and compare solvers?

    // map of array of vote entries
    let votes = {} as { [x: string]: ExtendedVote[] }
    let votesseen = 0
    while (solving) {
      // Loop through each entry list
      solving = false
      for (let hashListIndex = 0; hashListIndex < hashSetList.length; hashListIndex++) {
        // if we are already past the end of this entry list then skip
        let hashListEntry = hashSetList[hashListIndex]
        if ((index + 1) * stepSize > hashListEntry.hashSet.length) {
          continue
        }
        // don't remember what this bail condition was.
        let sliceStart = index * stepSize
        let v = hashListEntry.hashSet.slice(sliceStart, sliceStart + stepSize)
        if (v === '') {
          continue
        }
        solving = true // keep it going
        let votesArray: ExtendedVote[] = votes[v]
        if (votesArray == null) {
          votesseen++
          //TSConversion this was potetially a major bug, v was missing from this structure before!
          // @ts-ignore TSConversion solveHashSets2 is unused. but need to hold off o fixing up these potential nulls
          let votObject: ExtendedVote = { winIdx: null, val: v, v, count: 0, ec: 0, lowestIndex: index, voters: [], voteTally: Array(hashSetList.length), votesseen } as ExtendedVote
          votesArray = [votObject]
          votes[v] = votesArray

          // hashListEntry.ownVotes.push(votObject)
        }

        // get lowest value in list that we have not voted on and is not pinned by our best vote.
        let currentVoteObject: ExtendedVote | null = null
        for (let voteIndex = votesArray.length - 1; voteIndex >= 0; voteIndex--) {
          let voteObject = votesArray[voteIndex]

          let ourVoteTally = voteObject.voteTally[hashListIndex]
          if (ourVoteTally != null) {
            // we voted
            break
          }

          // how to check pinIdx?  do we have to analys neighbor pinIdx?
          // use pinObj  to see if the last pinObj A is greater than this obj B.
          if (hashListEntry.pinObj != null && hashListEntry.pinObj !== voteObject) {
            // if (hashListEntry.pinObj.val === voteObject.val)
            {
              let compare = Depricated.compareVoteObjects(hashListEntry.pinObj, voteObject, false)
              if (compare > 0) {
                continue // or break;
              }
            }
          }
          currentVoteObject = voteObject
        }

        if (currentVoteObject == null) {
          // create new vote object
          votesseen++
          //TSConversion this was potetially a major bug, v was missing from this structure before!
          // @ts-ignore TSConversion solveHashSets2 is unused. but need to hold off o fixing up these potential nulls
          currentVoteObject = { winIdx: null, val: v, v, count: 0, ec: 0, lowestIndex: index, voters: [], voteTally: Array(hashSetList.length), votesseen } as ExtendedVote
          votesArray.push(currentVoteObject)
          // hashListEntry.ownVotes.push(currentVoteObject)
        }
        if (currentVoteObject.voters == null) {
          throw new Error('solveHashSets2 currentVoteObject.voters == null')
        }
        if (hashListEntry == null || hashListEntry.ownVotes == null) {
          throw new Error(`solveHashSets2 hashListEntry == null ${hashListEntry == null}`)
        }

        currentVoteObject.voters.push(hashListIndex)
        currentVoteObject.voteTally[hashListIndex] = { i: index, p: hashListEntry.votePower } // could this be a simple index
        currentVoteObject.count += hashListEntry.votePower
        hashListEntry.ownVotes.push(currentVoteObject)

        if (currentVoteObject.winIdx !== null) {
          // this already won before but we should still update our own pinIdx

          hashListEntry.pinIdx = index
          hashListEntry.pinObj = currentVoteObject
        }
        if (currentVoteObject.count >= votesRequired) {
          for (let i = 0; i < hashSetList.length; i++) {
            let tallyObject = currentVoteObject.voteTally[i]
            if (tallyObject != null) {
              let tallyHashListEntry = hashSetList[i]
              tallyHashListEntry.pinIdx = tallyObject.i
              tallyHashListEntry.pinObj = currentVoteObject
            }
          }
          currentVoteObject.winIdx = index
        }
      }

      index++
    }

    // need backtracking ref for how each list tracks the votses

    // Collect a list of all vodes
    let allVotes: ExtendedVote[] = []
    for (const votesArray of Object.values(votes)) {
      for (let voteObj of votesArray) {
        allVotes.push(voteObj)
      }
    }
    // apply a partial order sort, n
    // allVotes.sort(function (a, b) { return Depricated.compareVoteObjects(a, b, false) })

    // generate solutions!

    // count only votes that have won!
    // when / how is it safe to detect a win?

    let allWinningVotes: ExtendedVote[] = []
    for (let voteObj of allVotes) {
      // IF was a a winning vote?
      if (voteObj.winIdx !== null) {
        allWinningVotes.push(voteObj)
      }
    }
    allWinningVotes.sort(function (a, b) {
      return Depricated.compareVoteObjects(a, b, false)
    })
    let finalIdx = 0
    for (let voteObj of allWinningVotes) {
      // IF was a a winning vote?
      if (voteObj.winIdx !== null) {
        // allWinningVotes.push(voteObj)
        output.push(voteObj.val)
        voteObj.finalIdx = finalIdx
        finalIdx++
      }
    }
    // to sort the values we could look at the order things were finalized..
    // but you could have a case where an earlier message is legitimately finialized later on.

    // let aTest = votes['55403088d5636488d3ff17d7d90c052e'][0]
    // let bTest = votes['779980ea84b8a5eac2dc3d07013377e5'][0]
    // console.log(Depricated.compareVoteObjects(aTest, bTest, false))
    // console.log(Depricated.compareVoteObjects(bTest, aTest, false))

    // correction solver:
    for (let hashListIndex = 0; hashListIndex < hashSetList.length; hashListIndex++) {
      // if we are already past the end of this entry list then skip
      // let hashListIndex = 2

      let hashListEntry = hashSetList[hashListIndex]
      hashListEntry.corrections = [] // clear this
      // hashListEntry.instructions = []
      // console.log(`solution for set ${hashListIndex}  locallen:${hashListEntry.hashSet.length / stepSize} `)
      let winningVoteIndex = 0
      for (let voteObj of allWinningVotes) {
        if (voteObj.voteTally[hashListIndex] == null) {
          // console.log(`missing @${voteObj.finalIdx} v:${voteObj.val}`)
          // bv: hashListEntry.lastValue, if: lastOutputCount  are old.
          // @ts-ignore TSConversion solveHashSets2 is unused. but need to hold off o fixing up these potential nulls
          hashListEntry.corrections.push({ i: winningVoteIndex, tv: voteObj, v: voteObj.val, t: 'insert', bv: null, if: -1 })
        }
        // what if we have it but it is in the wrong spot!!
        winningVoteIndex++
      }
      if (hashListEntry == null || hashListEntry.ownVotes == null) {
        throw new Error(`solveHashSets2 hashListEntry == null 2 ${hashListEntry == null}`)
      }
      for (let voteObj of hashListEntry.ownVotes) {
        let localIdx = voteObj.voteTally[hashListIndex].i
        if (voteObj.winIdx == null) {
          // console.log(`extra @${stringify(voteObj.voteTally[hashListIndex])} v:${voteObj.val}`)
          // @ts-ignore TSConversion solveHashSets2 is unused. but need to hold off o fixing up these potential nulls
          hashListEntry.corrections.push({ i: localIdx, t: 'extra', c: null, hi: localIdx, tv: null, v: null, bv: null, if: -1 })
        }
        // localIdx++
      }

      // not so sure about this sort  local vs. global index space.
      hashListEntry.corrections.sort(utils.sort_i_Asc) // (a, b) => a.i - b.i)
      winningVoteIndex = 0

      // hashListEntry.allWinningVotes = allWinningVotes

      // build index map now!
      hashListEntry.indexMap = []
      hashListEntry.extraMap = []

      for (let voteObj of allWinningVotes) {
        if (voteObj.voteTally[hashListIndex] == null) {
          hashListEntry.indexMap.push(-1)
        } else {
          hashListEntry.indexMap.push(voteObj.voteTally[hashListIndex].i)
        }
      }
      for (let voteObj of hashListEntry.ownVotes) {
        let localIdx = voteObj.voteTally[hashListIndex].i
        if (voteObj.winIdx == null) {
          hashListEntry.extraMap.push(localIdx)
        }
      }
    }

    // generate corrections for main entry.
    // hashListEntry.corrections.push({ i: index, tv: topVote, v: topVote.v, t: 'insert', bv: hashListEntry.lastValue, if: lastOutputCount })
    // hashListEntry.errorStack.push({ i: index, tv: topVote, v: topVote.v })
    // hashListEntry.indexOffset -= 1

    // trailing extras:
    // while ((extraIdx + hashListEntry.indexOffset) * stepSize < hashListEntry.hashSet.length) {
    //   let hi = extraIdx + hashListEntry.indexOffset // index2 - (j + 1)
    //   hashListEntry.corrections.push({ i: extraIdx, t: 'extra', c: null, hi: hi, tv: null, v: null, bv: null, if: -1 }) // added , tv: null, v: null, bv: null, if: -1
    //   extraIdx++
    // }

    return output // { output, outputVotes }
  }

  /**
   * expandIndexMapping
   * efficient transformation to create a lookup to go from answer space index to the local index space of a hashList entry
   * also creates a list of local indicies of elements to remove
   * @param {GenericHashSetEntry} hashListEntry
   * @param {string[]} output This is the output that we got from the general solver
   */
  static expandIndexMapping(hashListEntry: GenericHashSetEntry, output: string[]) {
    // hashListEntry.corrections.sort(function (a, b) { return a.i === b.i ? 0 : a.i < b.i ? -1 : 1 })
    // // index map is our index to the solution output
    // hashListEntry.indexMap = []
    // // extra map is the index in our list that is an extra
    // hashListEntry.extraMap = []
    // let readPtr = 0
    // let writePtr = 0
    // let correctionIndex = 0
    // let currentCorrection = null
    // let extraBits = 0
    // // This will walk the input and output indicies st that same time
    // while (writePtr < output.length) {
    //   // Get the current correction.  We walk this with the correctionIndex
    //   if (correctionIndex < hashListEntry.corrections.length && hashListEntry.corrections[correctionIndex] != null && hashListEntry.corrections[correctionIndex].t === 'insert' && hashListEntry.corrections[correctionIndex].i <= writePtr) {
    //     currentCorrection = hashListEntry.corrections[correctionIndex]
    //     correctionIndex++
    //   } else if (correctionIndex < hashListEntry.corrections.length && hashListEntry.corrections[correctionIndex] != null && hashListEntry.corrections[correctionIndex].t === 'extra' && hashListEntry.corrections[correctionIndex].hi <= readPtr) {
    //     currentCorrection = hashListEntry.corrections[correctionIndex]
    //     correctionIndex++
    //   } else {
    //     currentCorrection = null
    //   }
    //   // if (extraBits > 0) {
    //   //   readPtr += extraBits
    //   //   extraBits = 0
    //   // }
    //   // increment pointers based on if there is a correction to write and what type of correction it is
    //   if (!currentCorrection) {
    //     // no correction to consider so we just write to the index map and advance the read and write pointer
    //     hashListEntry.indexMap.push(readPtr)
    //     writePtr++
    //     readPtr++
    //   } else if (currentCorrection.t === 'insert') {
    //     // insert means the fix for this slot is to insert an item, since we dont have it this will be -1
    //     hashListEntry.indexMap.push(-1)
    //     writePtr++
    //   } else if (currentCorrection.t === 'extra') {
    //     // hashListEntry.extraMap.push({ i: currentCorrection.i, hi: currentCorrection.hi })
    //     hashListEntry.extraMap.push(currentCorrection.hi)
    //     extraBits++
    //     readPtr++
    //     // if (currentCorrection.c === null) {
    //     //   writePtr++
    //     // }
    //     continue
    //   }
    // }
    // // final corrections:
    // while (correctionIndex < hashListEntry.corrections.length) {
    //   currentCorrection = hashListEntry.corrections[correctionIndex]
    //   correctionIndex++
    //   if (currentCorrection.t === 'extra') {
    //     // hashListEntry.extraMap.push({ i: currentCorrection.i, hi: currentCorrection.hi })
    //     hashListEntry.extraMap.push(currentCorrection.hi)
    //     // extraBits++
    //     continue
    //   }
    // }
  }

  /**
   * solveHashSetsPrep
   * todo cleanup.. just sign the partition object asap so we dont have to check if there is a valid sign object throughout the code (but would need to consider perf impact of this)
   * @param {number} cycleNumber
   * @param {number} partitionId
   * @param {string} ourNodeKey
   * @return {GenericHashSetEntry[]}
   */
  solveHashSetsPrep(cycleNumber: number, partitionId: number, ourNodeKey: string): HashSetEntryPartitions[] {
    let key = 'c' + cycleNumber
    let responsesById = this.stateManager.partitionObjects.allPartitionResponsesByCycleByPartition[key]
    let key2 = 'p' + partitionId
    let responses = responsesById[key2]

    let hashSets = {} as { [hash: string]: HashSetEntryPartitions }
    let hashSetList: HashSetEntryPartitions[] = []
    // group identical sets together
    let hashCounting: StringNumberObjectMap = {}
    for (let partitionResult of responses) {
      let hash = partitionResult.Partition_hash
      let count = hashCounting[hash] || 0
      if (count === 0) {
        let owner: string | null = null
        if (partitionResult.sign) {
          owner = partitionResult.sign.owner
        } else {
          owner = ourNodeKey
        }
        //TSConversion had to assert that owner is not null with owner!  seems ok
        let hashSet: HashSetEntryPartitions = { hash: hash, votePower: 0, hashSet: partitionResult.hashSet, lastValue: '', errorStack: [], corrections: [], indexOffset: 0, owners: [owner!], ourRow: false, waitForIndex: -1, ownVotes: [] }
        hashSets[hash] = hashSet
        hashSetList.push(hashSets[hash])
        // partitionResult.hashSetList = hashSet //Seems like this was only ever used for debugging, going to ax it to be safe!
      } else {
        if (partitionResult.sign) {
          hashSets[hash].owners.push(partitionResult.sign.owner)
        }
      }
      if (partitionResult.sign == null || partitionResult.sign.owner === ourNodeKey) {
        hashSets[hash].ourRow = true
        // hashSets[hash].owners.push(ourNodeKey)
      }

      count++
      hashCounting[hash] = count
      hashSets[hash].votePower = count
    }
    // NOTE: the fields owners and ourRow are user data for shardus and not known or used by the solving algorithm

    return hashSetList
  }

  /**
   * testHashsetSolution
   * @param {GenericHashSetEntry} ourHashSet
   * @param {GenericHashSetEntry} solutionHashSet
   * @returns {boolean}
   */
  static testHashsetSolution(ourHashSet: GenericHashSetEntry, solutionHashSet: GenericHashSetEntry, log: boolean = false): boolean {
    // let payload = { partitionId: partitionId, cycle: cycleNumber, tx_indicies: requestsByHost[i].hostIndex, hash: requestsByHost[i].hash }
    // repairTracker.solutionDeltas.push({ i: requestsByHost[i].requests[j], tx: acceptedTX, pf: result.passFail[j] })

    // let txSourceList = txList
    // if (txList.newTxList) {
    //   txSourceList = txList.newTxList
    // }

    // solutionDeltas.sort(function (a, b) {BAD SORT return a.i - b.i }) // why did b - a help us once??

    // let debugSol = []
    // for (let solution of repairTracker.solutionDeltas) {
    //   debugSol.push({ i: solution.i, tx: solution.tx.id.slice(0, 4) })  // TXSTATE_TODO
    // }

    let stepSize = cHashSetStepSize
    let makeTXArray = function (hashSet: GenericHashSetEntry): string[] {
      let txArray: string[] = []
      for (let i = 0; i < hashSet.hashSet.length / stepSize; i++) {
        let offset = i * stepSize
        let v = hashSet.hashSet.slice(offset, offset + stepSize)
        txArray.push(v)
        // need to slice out state???
      }
      return txArray
    }

    let txSourceList = { hashes: makeTXArray(ourHashSet) }
    let solutionTxList = { hashes: makeTXArray(solutionHashSet) }
    let newTxList = { thashes: [], hashes: [], states: [] } as { thashes: string[]; hashes: string[]; states: string[] }

    let solutionList: HashSetEntryCorrection[] = []
    for (let correction of ourHashSet.corrections) {
      if (correction.t === 'insert') {
        solutionList.push(correction)
      }
    }

    // hack remove extraneous extras../////////////
    // let extraMap2 = []
    // for (let i = 0; i < ourHashSet.extraMap.length; i++) {
    //   let extraIndex = ourHashSet.extraMap[i]
    //   let extraNeeded = false
    //   for (let correction of ourHashSet.corrections) {
    //     if (correction.i === extraIndex) {
    //       extraNeeded = true
    //       break
    //     }
    //   }
    //   if (extraNeeded) {
    //     continue
    //   }
    //   extraMap2.push(extraIndex)
    // }
    // ourHashSet.extraMap = extraMap2
    // ///////////////////////////////////////

    if (ourHashSet.extraMap == null) {
      if (log) console.log(`testHashsetSolution: ourHashSet.extraMap missing`)
      return false
    }
    if (ourHashSet.indexMap == null) {
      if (log) console.log(`testHashsetSolution: ourHashSet.indexMap missing`)
      return false
    }
    ourHashSet.extraMap.sort(utils.sortAsc) // function (a, b) { return a - b })
    solutionList.sort(utils.sort_i_Asc) // function (a, b) { return a.i - b.i })

    let extraIndex = 0
    for (let i = 0; i < txSourceList.hashes.length; i++) {
      let extra = -1
      if (extraIndex < ourHashSet.extraMap.length) {
        extra = ourHashSet.extraMap[extraIndex]
      }
      if (extra === i) {
        extraIndex++
        continue
      }
      if (extra == null) {
        if (log) console.log(`testHashsetSolution error extra == null at i: ${i}  extraIndex: ${extraIndex}`)
        break
      }
      if (txSourceList.hashes[i] == null) {
        if (log) console.log(`testHashsetSolution error null at i: ${i}  extraIndex: ${extraIndex}`)
        break
      }

      newTxList.thashes.push(txSourceList.hashes[i])
      // newTxList.tpassed.push(txSourceList.passed[i])
      // newTxList.ttxs.push(txSourceList.txs[i])
    }

    let hashSet = ''
    // for (let hash of newTxList.thashes) {
    //   hashSet += hash.slice(0, stepSize)

    //   // todo add in the account state stuff..
    // }
    hashSet = Depricated.createHashSetString(newTxList.thashes, newTxList.states) // TXSTATE_TODO

    if (log) console.log(`extras removed: len: ${ourHashSet.indexMap.length}  extraIndex: ${extraIndex} ourPreHashSet: ${hashSet}`)

    // Txids: txSourceData.hashes, // txid1, txid2, …],  - ordered from oldest to recent
    // Status: txSourceData.passed, // [1,0, …],      - ordered corresponding to Txids; 1 for applied; 0 for failed
    // build our data while skipping extras.

    // insert corrections in order for each -1 in our local list (or write from our temp lists above)
    let ourCounter = 0
    let solutionIndex = 0
    for (let i = 0; i < ourHashSet.indexMap.length; i++) {
      let currentIndex = ourHashSet.indexMap[i]
      if (currentIndex >= 0) {
        // pull from our list? but we have already removed stuff?
        newTxList.hashes[i] = txSourceList.hashes[currentIndex] // newTxList.thashes[ourCounter]
        // newTxList.passed[i] = newTxList.tpassed[ourCounter]
        // newTxList.txs[i] = newTxList.ttxs[ourCounter]

        if (newTxList.hashes[i] == null) {
          if (log) console.log(`testHashsetSolution error null at i: ${i} solutionIndex: ${solutionIndex}  ourCounter: ${ourCounter}`)
          return false
        }
        ourCounter++
      } else {
        // repairTracker.solutionDeltas.push({ i: requestsByHost[i].requests[j], tx: acceptedTX, pf: result.passFail[j] })
        // let solutionDelta = repairTracker.solutionDeltas[solutionIndex]

        let correction = solutionList[solutionIndex]

        if (correction == null) {
          continue
        }
        // if (!solutionDelta) {
        //   if (this.verboseLogs) this.mainLogger.error( `_mergeRepairDataIntoLocalState2 a error solutionDelta=null  solutionIndex: ${solutionIndex} i:${i} of ${ourHashSet.indexMap.length} deltas: ${utils.stringifyReduce(repairTracker.solutionDeltas)}`)
        // }
        // insert the next one
        newTxList.hashes[i] = solutionTxList.hashes[correction.i] // solutionDelta.tx.id

        // newTxList.states[i] = solutionTxList.states[correction.i] // TXSTATE_TODO

        if (newTxList.hashes[i] == null) {
          if (log) console.log(`testHashsetSolution error null at i: ${i}  solutionIndex: ${solutionIndex}  ourCounter: ${ourCounter}`)
        }
        // newTxList.passed[i] = solutionDelta.pf
        // newTxList.txs[i] = solutionDelta.tx
        solutionIndex++
        // if (newTxList.hashes[i] == null) {
        //   if (this.verboseLogs) this.mainLogger.error( `_mergeRepairDataIntoLocalState2 b error null at i: ${i}  solutionIndex: ${solutionIndex}  ourCounter: ${ourCounter}`)
        // }
      }
    }

    hashSet = ''
    // for (let hash of newTxList.hashes) {
    //   if (!hash) {
    //     hashSet += 'xx'
    //     continue
    //   }
    //   hashSet += hash.slice(0, stepSize)
    // }
    hashSet = Depricated.createHashSetString(newTxList.hashes, null) // TXSTATE_TODO  newTxList.states

    if (solutionHashSet.hashSet !== hashSet) {
      return false
    }

    if (log) console.log(`solved set len: ${hashSet.length / stepSize}  : ${hashSet}`)
    // if (this.verboseLogs) this.mainLogger.debug( `_mergeRepairDataIntoLocalState2 c  len: ${ourHashSet.indexMap.length}  solutionIndex: ${solutionIndex}  ourCounter: ${ourCounter} ourHashSet: ${hashSet}`)

    return true
  }

  /**
   * createHashSetString
   * @param {*} txHashes // todo find correct values
   * @param {*} dataHashes
   * @returns {*} //todo correct type
   */
  static createHashSetString(txHashes: string[], dataHashes: string[] | null) {
    let hashSet = ''

    if (dataHashes == null) {
      for (let i = 0; i < txHashes.length; i++) {
        let txHash = txHashes[i]

        if (!txHash) {
          txHash = 'xx'
        }

        hashSet += txHash.slice(0, cHashSetTXStepSize + cHashSetDataStepSize)
      }
      return hashSet
    } else {
      for (let i = 0; i < txHashes.length; i++) {
        let txHash = txHashes[i]
        let dataHash = dataHashes[i]
        if (!txHash) {
          txHash = 'xx'
        }
        if (!dataHash) {
          dataHash = 'xx'
        }
        dataHash = 'xx' // temp hack stop tracking data hashes for now.
        hashSet += txHash.slice(0, cHashSetTXStepSize)
        hashSet += dataHash.slice(0, cHashSetDataStepSize)
      }
    }

    return hashSet
  }

  /**
   * sendPartitionData
   * @param {PartitionReceipt} partitionReceipt
   * @param {PartitionObject} paritionObject
   */
  sendPartitionData(partitionReceipt: PartitionReceipt, paritionObject: PartitionObject) {
    if (partitionReceipt.resultsList.length === 0) {
      return
    }
    // CombinedPartitionReceipt

    let partitionReceiptCopy = JSON.parse(stringify(partitionReceipt.resultsList[0]))

    /** @type {CombinedPartitionReceipt} */
    let combinedReciept = { result: partitionReceiptCopy, signatures: partitionReceipt.resultsList.map((a) => a.sign) }

    if (this.verboseLogs) this.mainLogger.debug(' sendPartitionData ' + utils.stringifyReduceLimit({ combinedReciept, paritionObject }))

    // send it
    // this.p2p.archivers.sendPartitionData(combinedReciept, paritionObject)
  }

  sendTransactionData(partitionNumber: number, cycleNumber: number, transactions: AcceptedTx[]) {
    if (this.verboseLogs) this.mainLogger.debug(' sendTransactionData ' + utils.stringifyReduceLimit({ partitionNumber, cycleNumber, transactions }))

    // send it
    // this.p2p.archivers.sendTransactionData(partitionNumber, cycleNumber, transactions)
  }

  /**
   * trySendAndPurgeReciepts
   * @param {PartitionReceipt} partitionReceipt
   */
  trySendAndPurgeReceiptsToArchives(partitionReceipt: PartitionReceipt) {
    if (partitionReceipt.resultsList.length === 0) {
      return
    }
    let cycleNumber = partitionReceipt.resultsList[0].Cycle_number
    let partitionId = partitionReceipt.resultsList[0].Partition_id
    let key = `c${cycleNumber}p${partitionId}`
    if (this.sentReceipts.has(key)) {
      return
    }

    if (this.verboseLogs) this.mainLogger.debug(' trySendAndPurgeReceipts ' + key)

    this.sentReceipts.set(key, true)
    try {
      if (this.sendArchiveData === true) {
        let paritionObject = this.getPartitionObject(cycleNumber, partitionId) // todo get object
        if (paritionObject == null) {
          this.statemanager_fatal(`trySendAndPurgeReceiptsToArchives`, ` trySendAndPurgeReceiptsToArchives paritionObject == null ${cycleNumber} ${partitionId}`)
          throw new Error(`trySendAndPurgeReceiptsToArchives paritionObject == null`)
        }
        this.sendPartitionData(partitionReceipt, paritionObject)
      }
    } finally {
    }

    if (this.sendTransactionData) {
      let txList = this.stateManager.partitionObjects.getTXList(cycleNumber, partitionId)

      this.sendTransactionData(partitionId, cycleNumber, txList.txs)
    }

    if (this.purgeArchiveData === true) {
      // alreay sort of doing this in another spot.
      // check if all partitions for this cycle have been handled!! then clear data in that time range.
      // need to record time range.
      // or check for open repairs. older than what we want to clear out.
    }
  }

  storeOurPartitionReceipt(cycleNumber: number, partitionReceipt: PartitionReceipt) {
    let key = 'c' + cycleNumber

    if (!this.stateManager.ourPartitionReceiptsByCycleCounter) {
      this.stateManager.ourPartitionReceiptsByCycleCounter = {}
    }
    this.stateManager.ourPartitionReceiptsByCycleCounter[key] = partitionReceipt
  }

  getPartitionReceipt(cycleNumber: number) {
    let key = 'c' + cycleNumber

    if (!this.stateManager.ourPartitionReceiptsByCycleCounter) {
      return null
    }
    return this.stateManager.ourPartitionReceiptsByCycleCounter[key]
  }

  purgeTransactionData() {
    let tsStart = 0
    let tsEnd = 0
    this.storage.clearAcceptedTX(tsStart, tsEnd)
  }

  purgeStateTableData() {
    // do this by timestamp maybe..
    // this happnes on a slower scale.
    let tsEnd = 0 // todo get newest time to keep
    this.storage.clearAccountStateTableOlderThan(tsEnd)
  }

  /**
   * getPartitionObject
   * @param {number} cycleNumber
   * @param {number} partitionId
   * @returns {PartitionObject}
   */
  getPartitionObject(cycleNumber: number, partitionId: number): PartitionObject | null {
    let key = 'c' + cycleNumber
    let partitionObjects = this.stateManager.partitionObjects.partitionObjectsByCycle[key]
    for (let obj of partitionObjects) {
      if (obj.Partition_id === partitionId) {
        return obj
      }
    }
    return null
  }

  // TODO sharding  done! need to split this out by partition
  /**
   * getTXListByKey
   * just an alternative to getTXList where the calling code has alredy formed the cycle key
   * @param {string} key the cycle based key c##
   * @param {number} partitionId
   * @returns {TxTallyList}
   */
  getTXListByKey(key: string, partitionId: number): TxTallyList {
    // let txList = this.txByCycle[key]
    // if (!txList) {
    //   txList = { hashes: [], passed: [], txs: [], processed: false, states: [] } //  ,txById: {}  states may be an array of arraywith account after states
    //   this.txByCycle[key] = txList
    // }

    let txListByPartition = this.stateManager.partitionObjects.txByCycleByPartition[key]
    let pkey = 'p' + partitionId
    // now search for the correct partition
    if (!txListByPartition) {
      txListByPartition = {}
      this.stateManager.partitionObjects.txByCycleByPartition[key] = txListByPartition
    }
    let txList = txListByPartition[pkey]
    if (!txList) {
      txList = { hashes: [], passed: [], txs: [], processed: false, states: [] } // , txById: {}
      txListByPartition[pkey] = txList
    }
    return txList
  }

  /**
   * _getRepairTrackerForCycle
   * @param {number} counter
   * @param {number} partition
   * @returns {RepairTracker}
   */
  _getRepairTrackerForCycle(counter: number, partition: number) {
    let key = 'c' + counter
    let key2 = 'p' + partition
    let repairsByPartition = this.repairTrackingByCycleById[key]
    if (!repairsByPartition) {
      repairsByPartition = {}
      this.repairTrackingByCycleById[key] = repairsByPartition
    }
    let repairTracker = repairsByPartition[key2]
    if (!repairTracker) {
      // triedHashes: Hashes for partition objects that we have tried to reconcile with already
      // removedTXIds: a list of TXIds that we have removed
      // repairedTXs: a list of TXIds that we have added in
      // newPendingTXs: a list of TXs we fetched that are ready to process
      // newFailedTXs: a list of TXs that we fetched, they had failed so we save them but do not apply them
      // extraTXIds: a list of TXIds that our partition has that the leading partition does not.  This is what we need to remove
      // missingTXIds: a list of TXIds that our partition has that the leading partition has that we don't.  We will need to add these in using the list newPendingTXs
      if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(`_getRepairTrackerForCycle: creating for cycle:${counter} partition:${partition}`)
      repairTracker = {
        triedHashes: [],
        numNodes: this.stateManager.lastActiveNodeCount, // num nodes that we send partition results to
        counter: counter,
        partitionId: partition,
        key: key,
        key2: key2,
        removedTXIds: [],
        repairedTXs: [],
        newPendingTXs: [],
        newFailedTXs: [],
        extraTXIds: [],
        // extraTXs: [],
        missingTXIds: [],
        repairing: false,
        repairsNeeded: false,
        busy: false,
        txRepairComplete: false,
        txRepairReady: false,
        evaluationStarted: false,
        evaluationComplete: false,
        awaitWinningHash: false,
        repairsFullyComplete: false,
      }
      repairsByPartition[key2] = repairTracker

      // this.dataRepairStack.push(repairTracker)
      // this.dataRepairsStarted++

      // let combinedKey = key + key2
      // if (this.repairStartedMap.has(combinedKey)) {
      //   if (this.verboseLogs) this.mainLogger.error(`Already started repair on ${combinedKey}`)
      // } else {
      //   this.repairStartedMap.set(combinedKey, true)
      // }
    }
    return repairTracker
  }

  /**
   * repairTrackerMarkFinished
   * @param {RepairTracker} repairTracker
   * @param {string} debugTag
   */
  repairTrackerMarkFinished(repairTracker: RepairTracker, debugTag: string) {
    repairTracker.repairsFullyComplete = true

    let combinedKey = repairTracker.key + repairTracker.key2
    if (this.repairStartedMap.has(combinedKey)) {
      if (this.repairCompletedMap.has(combinedKey)) {
        if (this.verboseLogs) this.mainLogger.debug(`repairStats: finished repair ${combinedKey} -alreadyFlagged  tag:${debugTag}`)
      } else {
        this.stateManager.dataRepairsCompleted++
        this.repairCompletedMap.set(combinedKey, true)
        if (this.verboseLogs) this.mainLogger.debug(`repairStats: finished repair ${combinedKey} tag:${debugTag}`)
      }
    } else {
      // should be a trace?
      if (this.verboseLogs) this.mainLogger.debug(`repairStats: Calling complete on a key we dont have ${combinedKey} tag:${debugTag}`)
    }

    for (let i = this.dataRepairStack.length - 1; i >= 0; i--) {
      let repairTracker1 = this.dataRepairStack[i]
      if (repairTracker1 === repairTracker) {
        this.dataRepairStack.splice(i, 1)
      }
    }

    if (this.dataRepairStack.length === 0) {
      if (this.stateManager.stateIsGood === false) {
        if (this.verboseLogs) this.mainLogger.error(`No active data repair going on tag:${debugTag}`)
      }
      this.stateManager.stateIsGood = true
      this.stateManager.stateIsGood_activeRepairs = true
      this.stateManager.stateIsGood_txHashsetOld = true
    }
  }

  /**
   * repairTrackerClearForNextRepair
   * @param {RepairTracker} repairTracker
   */
  repairTrackerClearForNextRepair(repairTracker: RepairTracker) {
    if (this.verboseLogs) this.mainLogger.debug(` repairTrackerClearForNextRepair cycleNumber: ${repairTracker.counter} parition: ${repairTracker.partitionId} `)
    repairTracker.removedTXIds = []
    repairTracker.repairedTXs = []
    repairTracker.newPendingTXs = []
    repairTracker.newFailedTXs = []
    repairTracker.extraTXIds = []
    repairTracker.missingTXIds = []
  }

  /**
   * mergeAndApplyTXRepairs
   * @param {number} cycleNumber
   * @param {number} specificParition the old version of this would repair all partitions but we had to wait.  this works on just one partition
   */
  async mergeAndApplyTXRepairs(cycleNumber: number, specificParition: number) {
    if (this.verboseLogs) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs cycleNumber ${cycleNumber} partition: ${specificParition}`)
    // walk through all txs for this cycle.
    // get or create entries for accounts.
    // track when they have missing txs or wrong txs

    let lastCycleShardValues = this.stateManager.shardValuesByCycle.get(cycleNumber)
    if (lastCycleShardValues == null) {
      throw new Error('mergeAndApplyTXRepairs lastCycleShardValues == null')
    }
    if (lastCycleShardValues.ourConsensusPartitions == null) {
      throw new Error('mergeAndApplyTXRepairs lastCycleShardValues.ourConsensusPartitions')
    }

    for (let partitionID of lastCycleShardValues.ourConsensusPartitions) {
      // this is an attempt to just repair one parition.
      if (partitionID !== specificParition) {
        continue
      }

      let allTXsToApply: StringNumberObjectMap = {}
      let allExtraTXids: StringNumberObjectMap = {}
      let allAccountsToResetById: StringNumberObjectMap = {}
      let txIDToAcc: TxIDToSourceTargetObjectMap = {}
      let allNewTXsById: TxObjectById = {}
      // get all txs and sort them
      let repairsByPartition = this.repairTrackingByCycleById['c' + cycleNumber]
      // let partitionKeys = Object.keys(repairsByPartition)
      // for (let key of partitionKeys) {
      let key = 'p' + partitionID
      let repairEntry = repairsByPartition[key]
      for (let tx of repairEntry.newPendingTXs) {
        if (utils.isString(tx.data)) {
          // @ts-ignore sometimes we have a data field that gets stuck as a string.  would be smarter to fix this upstream.
          tx.data = JSON.parse(tx.data)
        }
        let keysResponse = this.app.getKeyFromTransaction(tx.data)

        if (!keysResponse) {
          if (this.verboseLogs) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs problem with keysResp  ${utils.stringifyReduce(keysResponse)}  tx:  ${utils.stringifyReduce(tx)}`)
        }

        let { sourceKeys, targetKeys } = keysResponse

        for (let accountID of sourceKeys) {
          allAccountsToResetById[accountID] = 1
        }
        for (let accountID of targetKeys) {
          allAccountsToResetById[accountID] = 1
        }
        allNewTXsById[tx.id] = tx
        txIDToAcc[tx.id] = { sourceKeys, targetKeys }
      }
      for (let tx of repairEntry.missingTXIds) {
        allTXsToApply[tx] = 1
      }
      for (let tx of repairEntry.extraTXIds) {
        allExtraTXids[tx] = 1
        // TODO Repair. ugh have to query our data and figure out which accounts need to be reset.
      }
      if (this.verboseLogs) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs: extra: ${utils.stringifyReduce(allExtraTXids)}  txIDToAcc: ${utils.stringifyReduce(txIDToAcc)}`)

      // todo repair: hmmm also reset accounts have a tx we need to remove.
      // }

      let txList = this.stateManager.partitionObjects.getTXList(cycleNumber, partitionID) // done todo sharding: pass partition ID

      let txIDToAccCount = 0
      let txIDResetExtraCount = 0
      // build a list with our existing txs, but dont include the bad ones
      if (txList) {
        for (let i = 0; i < txList.txs.length; i++) {
          let tx = txList.txs[i]
          if (allExtraTXids[tx.id]) {
            // this was a bad tx dont include it.   we have to look up the account associated with this tx and make sure they get reset
            let keysResponse = this.app.getKeyFromTransaction(tx.data)
            if (!keysResponse) {
              if (this.verboseLogs) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs problem with keysResp2  ${utils.stringifyReduce(keysResponse)}  tx:  ${utils.stringifyReduce(tx)}`)
            }
            let { sourceKeys, targetKeys } = keysResponse
            for (let accountID of sourceKeys) {
              allAccountsToResetById[accountID] = 1
              txIDResetExtraCount++
            }
            for (let accountID of targetKeys) {
              allAccountsToResetById[accountID] = 1
              txIDResetExtraCount++
            }
          } else {
            // a good tx that we had earlier
            let keysResponse = this.app.getKeyFromTransaction(tx.data)
            let { sourceKeys, targetKeys } = keysResponse
            allNewTXsById[tx.id] = tx
            txIDToAcc[tx.id] = { sourceKeys, targetKeys }
            txIDToAccCount++
            // we will only play back the txs on accounts that point to allAccountsToResetById
          }
        }
      } else {
        if (this.verboseLogs) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs txList not found for: cycle: ${cycleNumber} in ${utils.stringifyReduce(this.stateManager.partitionObjects.txByCycleByPartition)}`)
      }

      // build and sort a list of TXs that we need to apply

      if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs txIDResetExtraCount: ${txIDResetExtraCount} allAccountsToResetById ${utils.stringifyReduce(allAccountsToResetById)}`)
      // reset accounts
      let accountKeys = Object.keys(allAccountsToResetById)
      if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs revert accountKeys ${utils.stringifyReduce(accountKeys)}`)

      if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs FIFO lock outer: ${cycleNumber}   ${utils.stringifyReduce(accountKeys)}`)
      let ourAccountLocks = await this.stateManager.bulkFifoLockAccounts(accountKeys)
      if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs FIFO lock inner: ${cycleNumber}   ${utils.stringifyReduce(accountKeys)}`)

      // let replacmentAccounts =  //returned by the below function for debug
      await this._revertAccounts(accountKeys, cycleNumber)

      // todo sharding - done extracted tx list calcs to run just for this partition inside of here. how does this relate to having a shard for every??
      // convert allNewTXsById map to newTXList list
      let newTXList = []
      let txKeys = Object.keys(allNewTXsById)
      for (let txKey of txKeys) {
        let tx = allNewTXsById[txKey]
        newTXList.push(tx)
      }

      // sort the list by ascending timestamp
      newTXList.sort(utils.sortTimestampAsc) // (function (a, b) { return a.timestamp - b.timestamp })

      if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs newTXList ${utils.stringifyReduce(newTXList)}`)
      if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs newTXList.length: ${newTXList.length} txKeys.length: ${txKeys.length} txIDToAccCount: ${txIDToAccCount}`)

      let applyCount = 0
      let applyFailCount = 0
      let hasEffect = false

      let accountValuesByKey: AccountValuesByKey = {}
      // let wrappedAccountResults = this.app.getAccountDataByList(accountKeys)
      // for (let wrappedData of wrappedAccountResults) {
      //   wrappedData.isPartial = false
      //   accountValuesByKey[wrappedData.accountId] = wrappedData
      // }
      // let wrappedAccountResults=[]
      // for(let key of accountKeys){
      //   this.app.get
      // }

      // todo sharding - done  (solved by brining newTX clacs inside of this loop)  does newTXList need to be filtered? we are looping over every partition. could this cause us to duplicate effort? YES allNewTXsById is handled above/outside of this loop
      for (let tx of newTXList) {
        let keysFilter = txIDToAcc[tx.id]
        // need a transform to map all txs that would matter.
        try {
          if (keysFilter) {
            let acountsFilter: AccountFilter = {} // this is a filter of accounts that we want to write to
            // find which accounts need txs applied.
            hasEffect = false
            for (let accountID of keysFilter.sourceKeys) {
              if (allAccountsToResetById[accountID]) {
                acountsFilter[accountID] = 1
                hasEffect = true
              }
            }
            for (let accountID of keysFilter.targetKeys) {
              if (allAccountsToResetById[accountID]) {
                acountsFilter[accountID] = 1
                hasEffect = true
              }
            }
            if (!hasEffect) {
              // no need to apply this tx because it would do nothing
              continue
            }

            if (this.verboseLogs) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs apply tx ${utils.makeShortHash(tx.id)} ${tx.timestamp} data: ${utils.stringifyReduce(tx)} with filter: ${utils.stringifyReduce(acountsFilter)}`)
            let hasStateTableData = false // may or may not have it but not tracking yet

            // TSConversion old way used to do this but seem incorrect to have receipt under data!
            // HACK!!  receipts sent across the net to us may need to get re parsed
            // if (utils.isString(tx.data.receipt)) {
            //   tx.data.receipt = JSON.parse(tx.data.receipt)
            // }

            if (utils.isString(tx.receipt)) {
              //@ts-ignore
              tx.receipt = JSON.parse(tx.receipt)
            }

            // todo needs wrapped states! and/or localCachedData

            // Need to build up this data.
            let keysResponse = this.app.getKeyFromTransaction(tx.data)
            let wrappedStates: WrappedResponses = {}
            let localCachedData: LocalCachedData = {}
            for (let key of keysResponse.allKeys) {
              // build wrapped states
              // let wrappedState = await this.app.getRelevantData(key, tx.data)

              let wrappedState: Shardus.WrappedResponse = accountValuesByKey[key] // need to init ths data. allAccountsToResetById[key]
              if (wrappedState == null) {
                // Theoretically could get this data from when we revert the data above..
                wrappedState = await this.app.getRelevantData(key, tx.data)
                accountValuesByKey[key] = wrappedState
              } else {
                wrappedState.accountCreated = false // kinda crazy assumption
              }
              wrappedStates[key] = wrappedState
              localCachedData[key] = wrappedState.localCache
              // delete wrappedState.localCache
            }

            let success = await this.testAccountTime(tx.data, wrappedStates)

            if (!success) {
              if (this.verboseLogs) this.mainLogger.debug(' testAccountTime failed. calling apoptosis. mergeAndApplyTXRepairs' + utils.stringifyReduce(tx))
              if (this.logger.playbackLogEnabled) this.logger.playbackLogNote('testAccountTime_failed', `${tx.id}`, ` testAccountTime failed. calling apoptosis. mergeAndApplyTXRepairs`)

              this.statemanager_fatal(`testAccountTime_failed`, ' testAccountTime failed. calling apoptosis. mergeAndApplyTXRepairs' + utils.stringifyReduce(tx))

              // return
              this.p2p.initApoptosis() // todo turn this back on
              // // return { success: false, reason: 'testAccountTime failed' }
              break
            }

            let applied = await this.tryApplyTransaction(tx, hasStateTableData, true, acountsFilter, wrappedStates, localCachedData) // TODO app interface changes.. how to get and pass the state wrapped account state in, (maybe simple function right above this
            // accountValuesByKey = {} // clear this.  it forces more db work but avoids issue with some stale flags
            if (!applied) {
              applyFailCount++
              if (this.verboseLogs) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs apply failed`)
            } else {
              applyCount++
            }
          } else {
            if (this.verboseLogs) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs no for ${tx.id} in ${utils.stringifyReduce(txIDToAcc)}`)
          }
        } catch (ex) {
          this.mainLogger.debug('_repair: startRepairProcess mergeAndApplyTXRepairs apply: ' + ` ${utils.stringifyReduce({ tx, keysFilter })} ` + ex.name + ': ' + ex.message + ' at ' + ex.stack)
          this.statemanager_fatal(`mergeAndApplyTXRepairs_ex`, '_repair: startRepairProcess mergeAndApplyTXRepairs apply: ' + ` ${utils.stringifyReduce({ tx, keysFilter })} ` + ex.name + ': ' + ex.message + ' at ' + ex.stack)
        }

        if (this.verboseLogs) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs applyCount ${applyCount} applyFailCount: ${applyFailCount}`)
      }

      // unlock the accounts we locked...  todo maybe put this in a finally statement?
      this.stateManager.bulkFifoUnlockAccounts(accountKeys, ourAccountLocks)
      if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair mergeAndApplyTXRepairs FIFO unlock: ${cycleNumber}   ${utils.stringifyReduce(accountKeys)}`)
    }
  }

  /**
   * updateTrackingAndPrepareChanges
   * @param {number} cycleNumber
   * @param {number} specificParition the old version of this would repair all partitions but we had to wait.  this works on just one partition
   */
  async updateTrackingAndPrepareRepairs(cycleNumber: number, specificParition: number) {
    if (this.verboseLogs) this.mainLogger.debug(` _repair updateTrackingAndPrepareRepairs cycleNumber ${cycleNumber} partition: ${specificParition}`)
    // walk through all txs for this cycle.
    // get or create entries for accounts.
    // track when they have missing txs or wrong txs
    let debugKey = `c${cycleNumber}p${specificParition}`
    let lastCycleShardValues = this.stateManager.shardValuesByCycle.get(cycleNumber)
    let paritionsServiced = 0
    try {
      // this was locking us to consensus only partitions. really just preap anything that is called on this fuciton since other logic may be doing work
      // on stored partitions.

      // for (let partitionID of lastCycleShardValues.ourConsensusPartitions) {
      // // this is an attempt to just repair one parition.
      //   if (partitionID !== specificParition) {
      //     continue
      //   }
      let partitionID = specificParition
      paritionsServiced++
      let allTXsToApply: StringNumberObjectMap = {}
      let allExtraTXids: StringNumberObjectMap = {}
      /** @type {Object.<string, number>} */
      let allAccountsToResetById: StringNumberObjectMap = {}
      /** @type {Object.<string, { sourceKeys:string[], targetKeys:string[] } >} */
      let txIDToAcc: TxIDToSourceTargetObjectMap = {}
      let allNewTXsById: TxObjectById = {}
      // get all txs and sort them
      let repairsByPartition = this.repairTrackingByCycleById['c' + cycleNumber]
      // let partitionKeys = Object.keys(repairsByPartition)
      // for (let key of partitionKeys) {
      let key = 'p' + partitionID
      let repairEntry = repairsByPartition[key]
      for (let tx of repairEntry.newPendingTXs) {
        if (utils.isString(tx.data)) {
          // @ts-ignore sometimes we have a data field that gets stuck as a string.  would be smarter to fix this upstream.
          tx.data = JSON.parse(tx.data)
        }
        let keysResponse = this.app.getKeyFromTransaction(tx.data)

        if (!keysResponse) {
          if (this.verboseLogs) this.mainLogger.debug(` _repair updateTrackingAndPrepareRepairs problem with keysResp  ${utils.stringifyReduce(keysResponse)}  tx:  ${utils.stringifyReduce(tx)}`)
        }

        let { sourceKeys, targetKeys } = keysResponse

        for (let accountID of sourceKeys) {
          allAccountsToResetById[accountID] = 1
        }
        for (let accountID of targetKeys) {
          allAccountsToResetById[accountID] = 1
        }
        allNewTXsById[tx.id] = tx
        txIDToAcc[tx.id] = { sourceKeys, targetKeys }
      }
      for (let tx of repairEntry.missingTXIds) {
        allTXsToApply[tx] = 1
      }
      for (let tx of repairEntry.extraTXIds) {
        allExtraTXids[tx] = 1
        // TODO Repair. ugh have to query our data and figure out which accounts need to be reset.
      }
      if (this.verboseLogs) this.mainLogger.debug(` _repair updateTrackingAndPrepareRepairs: extra: ${utils.stringifyReduce(allExtraTXids)}  txIDToAcc: ${utils.stringifyReduce(txIDToAcc)}`)

      // todo repair: hmmm also reset accounts have a tx we need to remove.
      // }

      let txList = this.stateManager.partitionObjects.getTXList(cycleNumber, partitionID) // done todo sharding: pass partition ID

      let txIDToAccCount = 0
      let txIDResetExtraCount = 0
      // build a list with our existing txs, but dont include the bad ones
      if (txList) {
        for (let i = 0; i < txList.txs.length; i++) {
          let tx = txList.txs[i]
          if (allExtraTXids[tx.id]) {
            // this was a bad tx dont include it.   we have to look up the account associated with this tx and make sure they get reset
            let keysResponse = this.app.getKeyFromTransaction(tx.data)
            if (!keysResponse) {
              if (this.verboseLogs) this.mainLogger.debug(` _repair updateTrackingAndPrepareRepairs problem with keysResp2  ${utils.stringifyReduce(keysResponse)}  tx:  ${utils.stringifyReduce(tx)}`)
            }
            let { sourceKeys, targetKeys } = keysResponse
            for (let accountID of sourceKeys) {
              allAccountsToResetById[accountID] = 1
              txIDResetExtraCount++
            }
            for (let accountID of targetKeys) {
              allAccountsToResetById[accountID] = 1
              txIDResetExtraCount++
            }
          } else {
            // a good tx that we had earlier
            let keysResponse = this.app.getKeyFromTransaction(tx.data)
            let { sourceKeys, targetKeys } = keysResponse
            allNewTXsById[tx.id] = tx
            txIDToAcc[tx.id] = { sourceKeys, targetKeys }
            txIDToAccCount++
            // we will only play back the txs on accounts that point to allAccountsToResetById
          }
        }
        if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair updateTrackingAndPrepareRepairs txIDResetExtraCount:${txIDResetExtraCount} txIDToAccCount: ${txIDToAccCount}`)
      } else {
        if (this.verboseLogs) this.mainLogger.debug(` _repair updateTrackingAndPrepareRepairs txList not found for: cycle: ${cycleNumber} in ${utils.stringifyReduce(this.stateManager.partitionObjects.txByCycleByPartition)}`)
      }

      // build and sort a list of TXs that we need to apply

      // OLD reset account code was here.

      // todo sharding - done extracted tx list calcs to run just for this partition inside of here. how does this relate to having a shard for every??
      // convert allNewTXsById map to newTXList list
      let newTXList = []
      let txKeys = Object.keys(allNewTXsById)
      for (let txKey of txKeys) {
        let tx = allNewTXsById[txKey]
        newTXList.push(tx)
      }

      // sort the list by ascending timestamp
      newTXList.sort(utils.sortTimestampAsc) // function (a, b) { return a.timestamp - b.timestamp })

      if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair updateTrackingAndPrepareRepairs newTXList ${utils.stringifyReduce(newTXList)}`)
      if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair updateTrackingAndPrepareRepairs newTXList.length: ${newTXList.length} txKeys.length: ${txKeys.length} txIDToAccCount: ${txIDToAccCount}`)

      // Save the results of this computation for later
      /** @type {UpdateRepairData}  */
      let updateData: UpdateRepairData = { newTXList, allAccountsToResetById, partitionId: specificParition, txIDToAcc }
      let ckey = 'c' + cycleNumber
      if (this.repairUpdateDataByCycle[ckey] == null) {
        this.repairUpdateDataByCycle[ckey] = []
      }
      this.repairUpdateDataByCycle[ckey].push(updateData)

      // how will the partition object get updated though??
      // }

      if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair updateTrackingAndPrepareRepairs finished`)
      if (paritionsServiced === 0) {
        this.statemanager_fatal(`_updateTrackingAndPrepareRepairs_fail`, `_updateTrackingAndPrepareRepairs failed. not partitions serviced: ${debugKey} our consensus:${utils.stringifyReduce(lastCycleShardValues?.ourConsensusPartitions)} `)
      }
    } catch (ex) {
      this.mainLogger.debug('__updateTrackingAndPrepareRepairs: exception ' + ` ${debugKey} ` + ex.name + ': ' + ex.message + ' at ' + ex.stack)
      this.statemanager_fatal(`_updateTrackingAndPrepareRepairs_ex`, '__updateTrackingAndPrepareRepairs: exception ' + ` ${debugKey} ` + ex.name + ': ' + ex.message + ' at ' + ex.stack)
    }
  }

  /**
   * updateTrackingAndPrepareChanges
   * @param {number} cycleNumber
   */
  async applyAllPreparedRepairs(cycleNumber: number) {
    if (this.applyAllPreparedRepairsRunning === true) {
      return
    }
    this.applyAllPreparedRepairsRunning = true

    if (this.verboseLogs) this.mainLogger.debug(` _repair applyAllPreparedRepairs cycleNumber ${cycleNumber}`)

    this.mainLogger.debug(`applyAllPreparedRepairs c:${cycleNumber}`)

    let ckey = 'c' + cycleNumber
    let repairDataList = this.repairUpdateDataByCycle[ckey]

    let txIDToAcc: TxIDToKeyObjectMap = {}
    let allAccountsToResetById: AccountBoolObjectMap = {}
    let newTXList: AcceptedTx[] = []
    for (let repairData of repairDataList) {
      newTXList = newTXList.concat(repairData.newTXList)
      allAccountsToResetById = Object.assign(allAccountsToResetById, repairData.allAccountsToResetById)
      txIDToAcc = Object.assign(txIDToAcc, repairData.txIDToAcc)
      this.mainLogger.debug(`applyAllPreparedRepairs c${cycleNumber}p${repairData.partitionId} reset:${Object.keys(repairData.allAccountsToResetById).length} txIDToAcc:${Object.keys(repairData.txIDToAcc).length} keys: ${utils.stringifyReduce(Object.keys(repairData.allAccountsToResetById))} `)
    }
    this.mainLogger.debug(`applyAllPreparedRepairs total reset:${Object.keys(allAccountsToResetById).length} txIDToAcc:${Object.keys(txIDToAcc).length}`)

    newTXList.sort(utils.sortTimestampAsc) // function (a, b) { return a.timestamp - b.timestamp })

    // build and sort a list of TXs that we need to apply

    if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair applyAllPreparedRepairs allAccountsToResetById ${utils.stringifyReduce(allAccountsToResetById)}`)
    // reset accounts
    let accountKeys = Object.keys(allAccountsToResetById)
    if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair applyAllPreparedRepairs revert accountKeys ${utils.stringifyReduce(accountKeys)}`)

    if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair applyAllPreparedRepairs FIFO lock outer: ${cycleNumber}   ${utils.stringifyReduce(accountKeys)}`)
    let ourAccountLocks = await this.stateManager.bulkFifoLockAccounts(accountKeys)
    if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair applyAllPreparedRepairs FIFO lock inner: ${cycleNumber}   ${utils.stringifyReduce(accountKeys)}`)

    // let replacmentAccounts =  //returned by the below function for debug
    await this._revertAccounts(accountKeys, cycleNumber)

    if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair applyAllPreparedRepairs newTXList ${utils.stringifyReduce(newTXList)}`)
    if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair applyAllPreparedRepairs newTXList.length: ${newTXList.length}`)

    let applyCount = 0
    let applyFailCount = 0
    let hasEffect = false
    let hasNonGlobalEffect = false

    // TSConversion WrappedStates issue
    let accountValuesByKey: WrappedResponses = {}

    let seenTXs: StringBoolObjectMap = {}
    for (let tx of newTXList) {
      if (seenTXs[tx.id] === true) {
        this.mainLogger.debug(`applyAllPreparedRepairs skipped double: ${utils.makeShortHash(tx.id)} ${tx.timestamp} `)
        continue
      }
      seenTXs[tx.id] = true

      let keysFilter = txIDToAcc[tx.id]
      // need a transform to map all txs that would matter.
      try {
        if (keysFilter) {
          let acountsFilter: AccountFilter = {} // this is a filter of accounts that we want to write to
          // find which accounts need txs applied.
          hasEffect = false
          hasNonGlobalEffect = false
          for (let accountID of keysFilter.sourceKeys) {
            if (allAccountsToResetById[accountID]) {
              acountsFilter[accountID] = 1
              hasEffect = true
              if (this.stateManager.accountGlobals.isGlobalAccount(accountID) === false) {
                hasNonGlobalEffect = true
              }
            }
          }
          for (let accountID of keysFilter.targetKeys) {
            if (allAccountsToResetById[accountID]) {
              acountsFilter[accountID] = 1
              hasEffect = true
              if (this.stateManager.accountGlobals.isGlobalAccount(accountID) === false) {
                hasNonGlobalEffect = true
              }
            }
          }
          if (!hasEffect) {
            // no need to apply this tx because it would do nothing
            continue
          }
          if (!hasNonGlobalEffect) {
            //if only a global account involved then dont reset!
            continue
          }

          if (this.verboseLogs) this.mainLogger.debug(` _repair applyAllPreparedRepairs apply tx ${utils.makeShortHash(tx.id)} ${tx.timestamp} data: ${utils.stringifyReduce(tx)} with filter: ${utils.stringifyReduce(acountsFilter)}`)
          let hasStateTableData = false // may or may not have it but not tracking yet

          // TSConversion old way used to do this but seem incorrect to have receipt under data!
          // // HACK!!  receipts sent across the net to us may need to get re parsed
          // if (utils.isString(tx.data.receipt)) {
          //   tx.data.receipt = JSON.parse(tx.data.receipt)
          // }
          if (utils.isString(tx.receipt)) {
            //@ts-ignore
            tx.receipt = JSON.parse(tx.receipt)
          }

          // todo needs wrapped states! and/or localCachedData

          // Need to build up this data.
          let keysResponse = this.app.getKeyFromTransaction(tx.data)
          let wrappedStates: WrappedResponses = {}
          let localCachedData: LocalCachedData = {}
          for (let key of keysResponse.allKeys) {
            // build wrapped states
            // let wrappedState = await this.app.getRelevantData(key, tx.data)

            let wrappedState: Shardus.WrappedResponse = accountValuesByKey[key] // need to init ths data. allAccountsToResetById[key]
            if (wrappedState == null) {
              // Theoretically could get this data from when we revert the data above..
              wrappedState = await this.app.getRelevantData(key, tx.data)
              // what to do in failure case.
              accountValuesByKey[key] = wrappedState
            } else {
              wrappedState.accountCreated = false // kinda crazy assumption
            }
            wrappedStates[key] = wrappedState
            localCachedData[key] = wrappedState.localCache
            // delete wrappedState.localCache
          }

          let success = await this.testAccountTime(tx.data, wrappedStates)

          if (!success) {
            if (this.verboseLogs) this.mainLogger.debug(' applyAllPreparedRepairs testAccountTime failed. calling apoptosis. applyAllPreparedRepairs' + utils.stringifyReduce(tx))
            if (this.logger.playbackLogEnabled) this.logger.playbackLogNote('testAccountTime_failed', `${tx.id}`, ` applyAllPreparedRepairs testAccountTime failed. calling apoptosis. applyAllPreparedRepairs`)
            this.statemanager_fatal(`applyAllPreparedRepairs_fail`, ' testAccountTime failed. calling apoptosis. applyAllPreparedRepairs' + utils.stringifyReduce(tx))

            // return
            this.p2p.initApoptosis() // todo turn this back on
            // // return { success: false, reason: 'testAccountTime failed' }
            break
          }

          // TODO: globalaccounts  this is where we go through the account state and just in time grab global accounts from the cache we made in the revert section from backup copies.
          //  TODO Perf probably could prepare of this inforamation above more efficiently but for now this is most simple and self contained.

          //TODO verify that we will even have wrapped states at this point in the repair without doing some extra steps.
          let wrappedStateKeys = Object.keys(wrappedStates)
          for (let wrappedStateKey of wrappedStateKeys) {
            let wrappedState = wrappedStates[wrappedStateKey]

            // if(wrappedState == null) {
            //   if (this.verboseLogs) this.mainLogger.error( ` _repair applyAllPreparedRepairs wrappedState == null ${utils.stringifyReduce(wrappedStateKey)} ${tx.timestamp}`)
            //   //could continue but want to see if there is more we can log.
            // }
            //is it global.
            if (this.stateManager.accountGlobals.isGlobalAccount(wrappedStateKey)) {
              // wrappedState.accountId)){
              if (this.logger.playbackLogEnabled) this.logger.playbackLogNote('globalAccountMap', `applyAllPreparedRepairs - has`, ` ${wrappedState.accountId} ${wrappedStateKey}`)
              if (wrappedState != null) {
                let globalValueSnapshot = this.stateManager.accountGlobals.getGlobalAccountValueAtTime(wrappedState.accountId, tx.timestamp)

                if (globalValueSnapshot == null) {
                  //todo some error?
                  let globalAccountBackupList = this.stateManager.accountGlobals.getGlobalAccountBackupList(wrappedStateKey)
                  if (this.verboseLogs) this.mainLogger.error(` _repair applyAllPreparedRepairs has global key but no snapshot at time ${tx.timestamp} entries:${globalAccountBackupList.length} ${utils.stringifyReduce(globalAccountBackupList.map((a) => `${a.timestamp}  ${utils.makeShortHash(a.accountId)} `))}  `)
                  continue
                }
                // build a new wrapped response to insert
                let newWrappedResponse: Shardus.WrappedResponse = { accountCreated: wrappedState.accountCreated, isPartial: false, accountId: wrappedState.accountId, timestamp: wrappedState.timestamp, stateId: globalValueSnapshot.hash, data: globalValueSnapshot.data }
                //set this new value into our wrapped states.
                wrappedStates[wrappedStateKey] = newWrappedResponse // update!!
                // insert thes data into the wrapped states.
                // yikes probably cant do local cached data at this point.
                if (this.verboseLogs) {
                  let globalAccountBackupList = this.stateManager.accountGlobals.getGlobalAccountBackupList(wrappedStateKey)
                  if (this.verboseLogs) this.mainLogger.error(` _repair applyAllPreparedRepairs has global key details ${tx.timestamp} entries:${globalAccountBackupList.length} ${utils.stringifyReduce(globalAccountBackupList.map((a) => `${a.timestamp}  ${utils.makeShortHash(a.accountId)} `))}  `)
                }

                if (this.verboseLogs) this.mainLogger.debug(` _repair applyAllPreparedRepairs got global account to repair from: ${utils.stringifyReduce(newWrappedResponse)}`)
              }
            } else {
              if (wrappedState == null) {
                if (this.verboseLogs) this.mainLogger.error(` _repair applyAllPreparedRepairs is not a global account but wrapped state == null ${utils.stringifyReduce(wrappedStateKey)} ${tx.timestamp}`)
              }
            }
          }

          let applied = await this.tryApplyTransaction(tx, hasStateTableData, /** repairing */ true, acountsFilter, wrappedStates, localCachedData) // TODO app interface changes.. how to get and pass the state wrapped account state in, (maybe simple function right above this
          // accountValuesByKey = {} // clear this.  it forces more db work but avoids issue with some stale flags
          if (!applied) {
            applyFailCount++
            if (this.verboseLogs) this.mainLogger.debug(` _repair applyAllPreparedRepairs apply failed`)
          } else {
            applyCount++
          }
        } else {
          if (this.verboseLogs) this.mainLogger.debug(` _repair applyAllPreparedRepairs no for ${tx.id} in ${utils.stringifyReduce(txIDToAcc)}`)
        }
      } catch (ex) {
        this.mainLogger.debug('_repair: startRepairProcess applyAllPreparedRepairs apply: ' + ` ${utils.stringifyReduce({ tx, keysFilter })} ` + ex.name + ': ' + ex.message + ' at ' + ex.stack)
        this.statemanager_fatal(`applyAllPreparedRepairs_fail`, '_repair: startRepairProcess applyAllPreparedRepairs apply: ' + ` ${utils.stringifyReduce({ tx, keysFilter })} ` + ex.name + ': ' + ex.message + ' at ' + ex.stack)
      }

      if (this.verboseLogs) this.mainLogger.debug(` _repair applyAllPreparedRepairs applyCount ${applyCount} applyFailCount: ${applyFailCount}`)
    }

    // unlock the accounts we locked...  todo maybe put this in a finally statement?
    this.stateManager.bulkFifoUnlockAccounts(accountKeys, ourAccountLocks)
    if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair applyAllPreparedRepairs FIFO unlock: ${cycleNumber}   ${utils.stringifyReduce(accountKeys)}`)
    // }
    this.applyAllPreparedRepairsRunning = false
  }

  /**
   * _revertAccounts
   * @param {string[]} accountIDs
   * @param {number} cycleNumber
   */
  async _revertAccounts(accountIDs: string[], cycleNumber: number) {
    let cycle = this.p2p.state.getCycleByCounter(cycleNumber)
    let cycleEnd = (cycle.start + cycle.duration) * 1000
    let cycleStart = cycle.start * 1000
    cycleEnd -= this.stateManager.syncSettleTime // adjust by sync settle time
    cycleStart -= this.stateManager.syncSettleTime // adjust by sync settle time
    let replacmentAccounts: Shardus.AccountsCopy[]
    let replacmentAccountsMinusGlobals = [] as Shardus.AccountsCopy[]
    if (this.verboseLogs) this.mainLogger.debug(` _repair _revertAccounts start  numAccounts: ${accountIDs.length} repairing cycle:${cycleNumber}`)

    try {
      // query our account copies that are less than or equal to this cycle!
      let prevCycle = cycleNumber - 1

      replacmentAccounts = (await this.storage.getAccountReplacmentCopies(accountIDs, prevCycle)) as Shardus.AccountsCopy[]

      if (replacmentAccounts.length > 0) {
        for (let accountData of replacmentAccounts) {
          if (utils.isString(accountData.data)) {
            accountData.data = JSON.parse(accountData.data)
            // hack, mode the owner so we can see the rewrite taking place
            // accountData.data.data.data = { rewrite: cycleNumber }
          }

          if (accountData == null || accountData.data == null || accountData.accountId == null) {
            if (this.verboseLogs) this.mainLogger.error(` _repair _revertAccounts null account data found: ${accountData.accountId} cycle: ${cycleNumber} data: ${utils.stringifyReduce(accountData)}`)
          } else {
            // todo overkill
            if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair _revertAccounts reset: ${utils.makeShortHash(accountData.accountId)} ts: ${utils.makeShortHash(accountData.timestamp)} cycle: ${cycleNumber} data: ${utils.stringifyReduce(accountData)}`)
          }
          // TODO: globalaccounts
          //this is where we need to no reset a global account, but instead grab the replacment data and cache it
          /// ////////////////////////
          //let isGlobalAccount = this.stateManager.accountGlobals.globalAccountMap.has(accountData.accountId )

          //Try not reverting global accounts..
          if (this.stateManager.accountGlobals.isGlobalAccount(accountData.accountId) === false) {
            replacmentAccountsMinusGlobals.push(accountData)
            if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair _revertAccounts not a global account, add to list ${utils.makeShortHash(accountData.accountId)}`)
          } else {
            if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair _revertAccounts was a global account, do not add to list ${utils.makeShortHash(accountData.accountId)}`)
          }
        }
        // tell the app to replace the account data
        //await this.app.resetAccountData(replacmentAccounts)
        await this.app.resetAccountData(replacmentAccountsMinusGlobals)
        // update local state.
      } else {
        if (this.verboseLogs) this.mainLogger.debug(` _repair _revertAccounts No replacment accounts found!!! cycle <= :${prevCycle}`)
      }

      if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair _revertAccounts: ${accountIDs.length} replacmentAccounts ${replacmentAccounts.length} repairing cycle:${cycleNumber} replacmentAccountsMinusGlobals: ${replacmentAccountsMinusGlobals.length}`)

      // TODO prodution. consider if we need a better set of checks before we delete an account!
      // If we don't have a replacement copy for an account we should try to delete it

      // Find any accountIDs not in resetAccountData
      let accountsReverted: StringNumberObjectMap = {}
      let accountsToDelete: string[] = []
      let debug = []
      for (let accountData of replacmentAccounts) {
        accountsReverted[accountData.accountId] = 1
        if (accountData.cycleNumber > prevCycle) {
          if (this.verboseLogs) this.mainLogger.error(` _repair _revertAccounts cycle too new for backup restore: ${accountData.cycleNumber}  cycleNumber:${cycleNumber} timestamp:${accountData.timestamp}`)
        }

        debug.push({ id: accountData.accountId, cycleNumber: accountData.cycleNumber, timestamp: accountData.timestamp, hash: accountData.hash, accHash: accountData.data.hash, accTs: accountData.data.timestamp })
      }

      if (this.verboseLogs) this.mainLogger.debug(` _repair _revertAccounts: ${utils.stringifyReduce(debug)}`)

      for (let accountID of accountIDs) {
        if (accountsReverted[accountID] == null) {
          accountsToDelete.push(accountID)
        }
      }
      if (accountsToDelete.length > 0) {
        if (this.verboseLogs) this.mainLogger.debug(` _repair _revertAccounts delete some accounts ${utils.stringifyReduce(accountsToDelete)}`)
        await this.app.deleteAccountData(accountsToDelete)
      }

      // mark for kill future txlist stuff for any accounts we nuked

      // make a map to find impacted accounts
      let accMap: StringNumberObjectMap = {}
      for (let accid of accountIDs) {
        accMap[accid] = 1
      }
      // check for this.tempTXRecords that involve accounts we are going to clear
      for (let txRecord of this.stateManager.partitionObjects.tempTXRecords) {
        // if (txRecord.txTS < cycleEnd) {
        let keysResponse = this.app.getKeyFromTransaction(txRecord.acceptedTx.data)
        if (!keysResponse) {
          if (this.verboseLogs) this.mainLogger.debug(` _repair _revertAccounts problem with keysResp  ${utils.stringifyReduce(keysResponse)}  tx:  ${utils.stringifyReduce(txRecord.acceptedTx)}`)
        }
        let { sourceKeys, targetKeys } = keysResponse
        for (let accountID of sourceKeys) {
          if (accMap[accountID]) {
            txRecord.redacted = cycleNumber
          }
        }
        for (let accountID of targetKeys) {
          if (accMap[accountID]) {
            txRecord.redacted = cycleNumber
          }
        }
        // }
      }

      // clear out bad state table data!!
      // add number to clear future state table data too
      await this.storage.clearAccountStateTableByList(accountIDs, cycleStart, cycleEnd + 1000000)

      // clear replacement copies for this cycle for these accounts!

      // todo clear based on GTE!!!
      await this.storage.clearAccountReplacmentCopies(accountIDs, cycleNumber)
    } catch (ex) {
      this.mainLogger.debug('_repair: _revertAccounts mergeAndApplyTXRepairs ' + ` ${utils.stringifyReduce({ cycleNumber, cycleEnd, cycleStart, accountIDs })} ` + ex.name + ': ' + ex.message + ' at ' + ex.stack)
      this.statemanager_fatal(`_revertAccounts_ex`, '_repair: _revertAccounts mergeAndApplyTXRepairs ' + ` ${utils.stringifyReduce({ cycleNumber, cycleEnd, cycleStart, accountIDs })} ` + ex.name + ': ' + ex.message + ' at ' + ex.stack)
    }

    return replacmentAccounts // this is for debugging reference
  }

  async testAccountTime(tx: Shardus.OpaqueTransaction, wrappedStates: WrappedStates) {
    function tryGetAccountData(accountID: string) {
      return wrappedStates[accountID]
    }

    try {
      let keysResponse = this.app.getKeyFromTransaction(tx)
      let { timestamp } = keysResponse // sourceKeys, targetKeys,
      // check account age to make sure it is older than the tx
      let failedAgeCheck = false

      let accountKeys = Object.keys(wrappedStates)
      for (let key of accountKeys) {
        let accountEntry = tryGetAccountData(key)
        if (accountEntry.timestamp >= timestamp) {
          failedAgeCheck = true
          if (this.verboseLogs) this.mainLogger.debug('testAccountTime account has future state.  id: ' + utils.makeShortHash(accountEntry.accountId) + ' time: ' + accountEntry.timestamp + ' txTime: ' + timestamp + ' delta: ' + (timestamp - accountEntry.timestamp))
        }
      }
      if (failedAgeCheck) {
        // if (this.verboseLogs) this.mainLogger.debug('DATASYNC: testAccountTimesAndStateTable accounts have future state ' + timestamp)
        return false
      }
    } catch (ex) {
      this.statemanager_fatal(`testAccountTime-fail_ex`, 'testAccountTime failed: ' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
      return false
    }
    return true // { success: true, hasStateTableData }
  }

  // state ids should be checked before applying this transaction because it may have already been applied while we were still syncing data.
  async tryApplyTransaction(acceptedTX: AcceptedTx, hasStateTableData: boolean, repairing: boolean, filter: AccountFilter, wrappedStates: WrappedResponses, localCachedData: LocalCachedData) {
    let ourLockID = -1
    let accountDataList
    let txTs = 0
    let accountKeys = []
    let ourAccountLocks = null
    let applyResponse: Shardus.ApplyResponse | null = null
    //have to figure out if this is a global modifying tx, since that impacts if we will write to global account.
    let isGlobalModifyingTX = false
    let savedSomething = false
    try {
      let tx = acceptedTX.data
      // let receipt = acceptedTX.receipt
      let keysResponse = this.app.getKeyFromTransaction(tx)
      let { timestamp, debugInfo } = keysResponse
      txTs = timestamp

      let queueEntry = this.stateManager.transactionQueue.getQueueEntry(acceptedTX.id)
      if (queueEntry != null) {
        if (queueEntry.globalModification === true) {
          isGlobalModifyingTX = true
        }
      }

      if (this.verboseLogs) this.mainLogger.debug(`tryApplyTransaction  ts:${timestamp} repairing:${repairing} hasStateTableData:${hasStateTableData} isGlobalModifyingTX:${isGlobalModifyingTX}  Applying! debugInfo: ${debugInfo}`)
      if (this.verboseLogs) this.mainLogger.debug(`tryApplyTransaction  filter: ${utils.stringifyReduce(filter)}`)
      if (this.verboseLogs) this.mainLogger.debug(`tryApplyTransaction  acceptedTX: ${utils.stringifyReduce(acceptedTX)}`)
      if (this.verboseLogs) this.mainLogger.debug(`tryApplyTransaction  wrappedStates: ${utils.stringifyReduce(wrappedStates)}`)
      if (this.verboseLogs) this.mainLogger.debug(`tryApplyTransaction  localCachedData: ${utils.stringifyReduce(localCachedData)}`)

      if (repairing !== true) {
        // get a list of modified account keys that we will lock
        let { sourceKeys, targetKeys } = keysResponse
        for (let accountID of sourceKeys) {
          accountKeys.push(accountID)
        }
        for (let accountID of targetKeys) {
          accountKeys.push(accountID)
        }
        if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair tryApplyTransaction FIFO lock outer: ${utils.stringifyReduce(accountKeys)} `)
        ourAccountLocks = await this.stateManager.bulkFifoLockAccounts(accountKeys)
        if (this.verboseLogs && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` _repair tryApplyTransaction FIFO lock inner: ${utils.stringifyReduce(accountKeys)} ourLocks: ${utils.stringifyReduce(ourAccountLocks)}`)
      }

      ourLockID = await this.stateManager.fifoLock('accountModification')

      if (this.verboseLogs) console.log(`tryApplyTransaction  ts:${timestamp} repairing:${repairing}  Applying!`)
      // if (this.verboseLogs) this.mainLogger.debug('APPSTATE: tryApplyTransaction ' + timestamp + ' Applying!' + ' source: ' + utils.makeShortHash(sourceAddress) + ' target: ' + utils.makeShortHash(targetAddress) + ' srchash_before:' + utils.makeShortHash(sourceState) + ' tgtHash_before: ' + utils.makeShortHash(targetState))
      this.stateManager.transactionQueue.applySoftLock = true

      // let replyObject = { stateTableResults: [], txId, txTimestamp, accountData: [] }
      // let wrappedStatesList = Object.values(wrappedStates)

      // TSConversion need to check how save this cast is for the apply fuction, should probably do more in depth look at the tx param.
      applyResponse = this.app.apply(tx as Shardus.IncomingTransaction, wrappedStates)
      let { stateTableResults, accountData: _accountdata } = applyResponse
      accountDataList = _accountdata

      if (this.verboseLogs) this.mainLogger.debug(`tryApplyTransaction  post apply wrappedStates: ${utils.stringifyReduce(wrappedStates)}`)
      // wrappedStates are side effected for now
      savedSomething = await this.stateManager.setAccount(wrappedStates, localCachedData, applyResponse, isGlobalModifyingTX, filter)

      if (this.verboseLogs) this.mainLogger.debug(`tryApplyTransaction  accountData[${accountDataList.length}]: ${utils.stringifyReduce(accountDataList)}`)
      if (this.verboseLogs) this.mainLogger.debug(`tryApplyTransaction  stateTableResults[${stateTableResults.length}]: ${utils.stringifyReduce(stateTableResults)}`)

      this.stateManager.transactionQueue.applySoftLock = false
      // only write our state table data if we dont already have it in the db
      if (hasStateTableData === false) {
        for (let stateT of stateTableResults) {
          if (this.verboseLogs) console.log('writeStateTable ' + utils.makeShortHash(stateT.accountId) + ' accounts total' + accountDataList.length)
          if (this.verboseLogs) this.mainLogger.debug('writeStateTable ' + utils.makeShortHash(stateT.accountId) + ' before: ' + utils.makeShortHash(stateT.stateBefore) + ' after: ' + utils.makeShortHash(stateT.stateAfter) + ' txid: ' + utils.makeShortHash(acceptedTX.id) + ' ts: ' + acceptedTX.timestamp)
        }
        await this.storage.addAccountStates(stateTableResults)
      }

      // post validate that state ended up correctly?

      // write the accepted TX to storage
      this.storage.addAcceptedTransactions([acceptedTX])
    } catch (ex) {
      this.statemanager_fatal(`tryApplyTransaction_ex`, 'tryApplyTransaction failed: ' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
      this.mainLogger.debug(`tryApplyTransaction failed id:${utils.makeShortHash(acceptedTX.id)}  ${utils.stringifyReduce(acceptedTX)}`)
      if (applyResponse) {
        // && savedSomething){
        // TSConversion do we really want to record this?
        // if (!repairing) this.stateManager.partitionObjects.tempRecordTXByCycle(txTs, acceptedTX, false, applyResponse, isGlobalModifyingTX, savedSomething)
        // record no-op state table fail:
      } else {
        // this.fatalLogger.fatal('tryApplyTransaction failed: applyResponse == null')
      }

      return false
    } finally {
      this.stateManager.fifoUnlock('accountModification', ourLockID)
      if (repairing !== true) {
        if (ourAccountLocks != null) {
          this.stateManager.bulkFifoUnlockAccounts(accountKeys, ourAccountLocks)
        }
        if (this.verboseLogs) this.mainLogger.debug(` _repair tryApplyTransaction FIFO unlock inner: ${utils.stringifyReduce(accountKeys)} ourLocks: ${utils.stringifyReduce(ourAccountLocks)}`)
      }
    }

    // have to wrestle with the data a bit so we can backup the full account and not jsut the partial account!
    // let dataResultsByKey = {}
    let dataResultsFullList = []
    for (let wrappedData of applyResponse.accountData) {
      // if (wrappedData.isPartial === false) {
      //   dataResultsFullList.push(wrappedData.data)
      // } else {
      //   dataResultsFullList.push(wrappedData.localCache)
      // }
      if (wrappedData.localCache != null) {
        dataResultsFullList.push(wrappedData)
      }
      // dataResultsByKey[wrappedData.accountId] = wrappedData.data
    }

    // this is just for debug!!!
    if (dataResultsFullList[0] == null) {
      for (let wrappedData of applyResponse.accountData) {
        if (wrappedData.localCache != null) {
          dataResultsFullList.push(wrappedData)
        }
        // dataResultsByKey[wrappedData.accountId] = wrappedData.data
      }
    }
    // if(dataResultsFullList == null){
    //   throw new Error(`tryApplyTransaction (dataResultsFullList == null  ${txTs} ${utils.stringifyReduce(acceptedTX)} `);
    // }

    // TSConversion verified that app.setAccount calls shardus.applyResponseAddState  that adds hash and txid to the data and turns it into AccountData
    let upgradedAccountDataList: Shardus.AccountData[] = (dataResultsFullList as unknown) as Shardus.AccountData[]

    await this.stateManager.updateAccountsCopyTable(upgradedAccountDataList, repairing, txTs)

    if (!repairing) {
      //if(savedSomething){
      this.stateManager.partitionObjects.tempRecordTXByCycle(txTs, acceptedTX, true, applyResponse, isGlobalModifyingTX, savedSomething)
      //}

      //WOW this was not good!  had acceptedTX.transactionGroup[0].id
      //if (this.p2p.getNodeId() === acceptedTX.transactionGroup[0].id) {

      let queueEntry: QueueEntry | null = this.stateManager.transactionQueue.getQueueEntry(acceptedTX.id)
      if (queueEntry != null && queueEntry.transactionGroup != null && this.p2p.getNodeId() === queueEntry.transactionGroup[0].id) {
        this.stateManager.eventEmitter.emit('txProcessed')
      }

      this.stateManager.eventEmitter.emit('txApplied', acceptedTX)
    }

    return true
  }
}

export default Depricated
