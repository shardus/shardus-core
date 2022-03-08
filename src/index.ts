import merge from 'deepmerge'

import Shardus from './shardus'
import * as ShardusTypes from './shardus/shardus-types'
import { compareObjectShape } from './utils'

export { default as Shardus } from './shardus'
export { ShardusTypes }

// Temporary private export to avoid digging into shardus source code for
// functions it otherwise wasn't exporting. ATTOW we have not decided on whether
// a more permanent solution is proper.
import { addressToPartition, partitionInWrappingRange, findHomeNode } from './state-manager/shardFunctions'
export const __ShardFunctions = {
  addressToPartition,
  partitionInWrappingRange,
  findHomeNode
}

const defaultConfigs: ShardusTypes.ShardusConfiguration = {
  server: require('./config/server.json'),
  logs: require('./config/logs.json'),
  storage: require('./config/storage.json'),
}

const overwriteMerge = (target, source, options) => source

export function shardusFactory(configs = {}) {
  const mergedConfigs = merge(defaultConfigs, configs, {
    arrayMerge: overwriteMerge,
  })

  const { isValid, error } = compareObjectShape(defaultConfigs, mergedConfigs)

  if (error) {
    const defectiveObjectPath = `${error.defectiveChain.join('.')}`
    const msg = `Unacceptable config object shape, defective settings detected: ${defectiveObjectPath}`

    console.log(
      'INVALID CONFIG OBJECT PROPERTY OR TYPE MISMATCH OCCURS:',
      `${defectiveObjectPath}`
    )
    console.log(
      'For more information on configuration object, please check the documentation'
    )

    throw new Error(msg)
  }

  return new Shardus(mergedConfigs)
}
