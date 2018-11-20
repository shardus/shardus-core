const path = require('path')
const Shardus = require('../../../src/shardus')

// const { sleep } = require('../../../src/utils')

let config = module.require(path.join(__dirname, '../../../config/server.json'))
config.baseDir = '.'
config.log.confFile = 'config/logs.json'
config.storage.confFile = '../../../config/storage.json'
// increase the timeSync limit to avoid issues in the test
config.syncLimit = 100000

let shardus = new Shardus(config)

async function init () {
  await shardus.setup(config)
  shardus.registerExceptionHandler()
}

init()
