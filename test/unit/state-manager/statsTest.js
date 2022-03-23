const ShardFunctions =
  require('../../../build/src/state-manager/shardFunctions.js').default
// import {ShardGlobals,ShardInfo,WrappableParitionRange,NodeShardData,AddressRange, HomeNodeSummary,ParititionShardDataMap,NodeShardDataMap,MergeResults,BasicAddressRange} from  './shardFunctionTypes'
// import ShardFunctions from './shardFunctions.js'
const fs = require('fs')

const crypto = require('@shardus/crypto-utils')
const utils = require('../../../build/src/utils')
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

const ParitionStats =
  require('../../../build/src/state-manager/PartitionStats').default

const partitionStats = new ParitionStats()

const c47 = fs.readFileSync('C:\\shardus\\gitlab\\jsonFormat\\c60.json')
//let rawdata = fs.readFileSync('student.json');

//c47.replace(/\\"/g, '')

const toParse = c47 //unescapeSlashes(c47)

const statsLines = JSON.parse(toParse)

const consoleStream = {write: line => console.log(line)}

const {
  allPassed,
  allPassedMetric2,
  singleVotePartitions,
  multiVotePartitions,
  badPartitions,
  totalTx,
} = partitionStats.processTxStatsDump(
  consoleStream,
  partitionStats.txStatsTallyFunction,
  statsLines
)

//TX statsReport0  : false pass2: false  single:11 multi:20 badPartitions:18,20,21,16,17,24,26,27,11,12,13,14,15,4,5,0,2,3,29,30

const cycleNumber = 0
consoleStream.write(
  `TX statsReport${cycleNumber}  : ${allPassed} pass2: ${allPassedMetric2}  single:${singleVotePartitions} multi:${multiVotePartitions} badPartitions:${badPartitions}\n`
)

console.log('end')
