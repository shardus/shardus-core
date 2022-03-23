import {existsSync, mkdirSync} from 'fs'
import * as got from 'got'
import * as log4js from 'log4js'
import * as os from 'os'
import {URL as URL} from 'url'
import * as http from '../http'
import {IPInfo} from '../network'
import {isDebugModeMiddleware} from '../network/debugMiddleware'
import * as Shardus from '../shardus/shardus-types'
import * as utils from '../utils'
import {nestedCountersInstance} from '../utils/nestedCounters'
const stringify = require('fast-stable-stringify')
const log4jsExtend = require('log4js-extend')

interface Logger {
  baseDir: string
  config: Shardus.LogsConfiguration
  logDir: string
  log4Conf: Shardus.LogsConfiguration['options']
  // playbackLogEnabled: boolean
  _playbackLogger: log4js.Logger
  // _playbackTrace: boolean
  // _playbackDebug: boolean
  _playbackOwner_host: string
  _playbackOwner: string
  _playbackIPInfo: IPInfo
  _nodeInfos: {
    [id: string]: {
      node: {
        [key: string]: unknown
      }
      out: string
      shorthash: string
    }
  }
  _playbackNodeID: string
}

// default: { appenders: ['out'], level: 'fatal' },
// app: { appenders: ['app', 'errors'], level: 'trace' },
// main: { appenders: ['main', 'errors'], level: 'trace' },
// fatal: { appenders: ['fatal'], level: 'fatal' },
// net: { appenders: ['net'], level: 'trace' },
// playback: { appenders: ['playback'], level: 'trace' },
// shardDump: { appenders: ['shardDump'], level: 'trace' },
// statsDump: { appenders: ['statsDump'], level: 'trace' },

// OFF	0
// FATAL	100
// ERROR	200
// WARN	300
// INFO	400
// DEBUG	500
// TRACE	600
// ALL	Integer.MAX_VALUE

/**
 * The point of LogFlags it to gain max performance when we need to reduce logging, and be able to ajust this in a simple
 * way when inside of a test.
 *
 * This does not not need to have a super amount of detail or permutations, because if logging is enabled to a medium amount
 * for debugging there will not be much gains or performance to fine grained details.
 *
 * verbose flag is still usefull for heavy logs, and playback seems to beneift from levels, so we could expand as needed
 */
export type LogFlags = {
  verbose: boolean
  fatal: boolean
  debug: boolean
  info: boolean // optional to use this. many info lines seem good to keep and minimal in stringify/frequency
  error: boolean

  console: boolean

  playback: boolean
  playback_trace: boolean
  playback_debug: boolean

  net_trace: boolean
  // main:boolean;
  // main_error:boolean;
  // main_debug:boolean;
  // main_trace:boolean;

  // playback:boolean;
  // playback_verbose:boolean

  p2pNonFatal: boolean
  // //p2p_info:boolean;

  // snapshot:boolean;
}

export const logFlags: LogFlags = {
  debug: true,
  fatal: true,
  verbose: true,
  info: true,
  console: true,
  error: true,

  playback: false,
  playback_trace: false,
  playback_debug: false,
  net_trace: false,
  // main:true,
  // main_error:true,
  // main_debug:true,
  // main_trace:true,

  // playback:true,
  // playback_verbose:true,

  p2pNonFatal: true,

  // snapshot:true,
}

class Logger {
  backupLogFlags!: LogFlags

  constructor(
    baseDir: string,
    config: Shardus.LogsConfiguration,
    dynamicLogMode: string
  ) {
    this.baseDir = baseDir
    this.config = config
    this._setupLogs(dynamicLogMode)
  }

  // Checks if the configuration has the required components
  _checkValidConfig() {
    const config = this.config
    if (!config.dir) throw Error('Fatal Error: Log directory not defined.')
    if (!config.files || typeof config.files !== 'object')
      throw Error('Fatal Error: Valid log file locations not provided.')
  }

  // Add filenames to each appender of type 'file'
  _addFileNamesToAppenders() {
    const conf = this.log4Conf
    if (!conf) throw new Error('config.logs.options is falsy')
    for (const key in conf.appenders) {
      const appender = conf.appenders[key as keyof typeof conf.appenders]
      if (!appender) throw new Error('config.logs.options.')
      if (appender.type !== 'file') continue
      appender.filename = `${this.logDir}/${key}.log`
    }
  }

  _configureLogs() {
    return log4js.configure(this.log4Conf as log4js.Configuration)
  }

  // Get the specified logger
  getLogger(logger: string) {
    return log4js.getLogger(logger)
  }

  // Setup the logs with the provided configuration using the base directory provided for relative paths
  _setupLogs(dynamicLogMode: string) {
    const baseDir = this.baseDir
    const config = this.config

    if (!baseDir) throw Error('Fatal Error: Base directory not defined.')
    if (!config) throw Error('Fatal Error: No configuration provided.')
    this._checkValidConfig()

    // Makes specified directory if it doesn't exist
    this.logDir = `${baseDir}/${config.dir}`
    if (!existsSync(this.logDir)) mkdirSync(this.logDir)

    // Read the log config from log config file
    this.log4Conf = config.options
    log4jsExtend(log4js)
    this._addFileNamesToAppenders()
    this._configureLogs()
    this.getLogger('main').info('Logger initialized.')

    this._playbackLogger = this.getLogger('playback')

    this.setupLogControlValues()

    if (
      dynamicLogMode.toLowerCase() === 'fatal' ||
      dynamicLogMode.toLowerCase() === 'fatals'
    ) {
      console.log('startInFatalsLogMode=true!')
      this.setFatalFlags()
    } else if (
      dynamicLogMode.toLowerCase() === 'error' ||
      dynamicLogMode.toLowerCase() === 'errors'
    ) {
      console.log('startInErrorLogMode=true!')
      this.setErrorFlags()
    }

    this._playbackOwner_host = os.hostname()
    this._playbackOwner = 'temp_' + this._playbackOwner_host
    this._nodeInfos = {}
    http.setLogger(this)
  }

  // Tells this module that the server is shutting down, returns a Promise that resolves when all logs have been written to file, sockets are closed, etc.
  shutdown() {
    return new Promise(resolve => {
      log4js.shutdown(() => {
        resolve('done')
      })
    })
  }

  setPlaybackIPInfo(ipInfo: IPInfo) {
    this._playbackIPInfo = ipInfo
    const newName =
      'temp_' +
      this._playbackOwner_host +
      ':' +
      this._playbackIPInfo.externalPort
    this.playbackLogNote('logHostNameUpdate', '', {newName})
    this._playbackOwner = newName
  }

  setPlaybackID(nodeID: string) {
    this._playbackNodeID = nodeID
    const newName =
      utils.makeShortHash(this._playbackNodeID) +
      ':' +
      this._playbackIPInfo.externalPort
    this.playbackLogNote('logHostNameUpdate', '', {
      newName,
      nodeID: nodeID + ' ',
    })
    this._playbackOwner = newName
  }

  identifyNode(input: unknown) {
    if (utils.isString(input)) {
      const inputString = input as string
      if (inputString.length === 64) {
        const seenNode = this._nodeInfos[inputString]
        if (seenNode) {
          return seenNode.out
        }
        return utils.makeShortHash(inputString)
      } else {
        return inputString
      }
    }

    if (utils.isObject(input)) {
      const inputObject = input as {[key: string]: unknown}
      if (inputObject.id && typeof inputObject.id === 'string') {
        const seenNode = this._nodeInfos[inputObject.id]
        if (seenNode) {
          return seenNode.out
        }
        const shorthash: string = utils.makeShortHash(inputObject.id)
        const out = shorthash + ':' + inputObject.externalPort
        this._nodeInfos[inputObject.id] = {node: inputObject, out, shorthash}
        return out
      }
      return stringify(inputObject)
    }
  }

  processDesc(desc: unknown) {
    if (utils.isObject(desc)) {
      desc = utils.stringifyReduce(desc)
    }

    return desc
  }

  playbackLog(
    from: string,
    to: string,
    type: string,
    endpoint: string,
    id: string | number,
    desc: unknown
  ) {
    if (!logFlags.playback) {
      return
    }

    nestedCountersInstance.countEvent(type, endpoint)

    const ts = Date.now()

    from = this.identifyNode(from)
    to = this.identifyNode(to)

    if (utils.isObject(id)) {
      id = stringify(id)
    } else {
      id = utils.makeShortHash(id)
    }

    if (logFlags.playback_trace) {
      desc = this.processDesc(desc)
      this._playbackLogger.trace(
        `\t${ts}\t${this._playbackOwner}\t${from}\t${to}\t${type}\t${endpoint}\t${id}\t${desc}`
      )
    }
    if (logFlags.playback_debug) {
      this._playbackLogger.debug(
        `\t${ts}\t${this._playbackOwner}\t${from}\t${to}\t${type}\t${endpoint}\t${id}`
      )
    }
  }
  playbackLogState(newState: string, id: string, desc: unknown) {
    this.playbackLog('', '', 'StateChange', newState, id, desc)
  }

  playbackLogNote(noteCategory: string, id: string, desc: unknown) {
    this.playbackLog('', '', 'Note', noteCategory, id, desc)
  }

  setFatalFlags() {
    for (const [key] of Object.entries(logFlags)) {
      logFlags[key as keyof typeof logFlags] = false
    }
    logFlags.fatal = true

    logFlags.playback = false
  }

  setErrorFlags() {
    for (const [key] of Object.entries(logFlags)) {
      logFlags[key as keyof typeof logFlags] = false
    }
    logFlags.fatal = true
    logFlags.error = true

    logFlags.playback = false
  }

  setDefaultFlags() {
    for (const [key] of Object.entries(logFlags)) {
      logFlags[key as keyof typeof logFlags] =
        this.backupLogFlags[key as keyof typeof logFlags]
    }

    if (logFlags.playback_trace || logFlags.playback_debug) {
      logFlags.playback = true
    } else {
      logFlags.playback = false
    }
  }

  registerEndpoints(Context: typeof import('../p2p/Context')) {
    Context.network.registerExternalGet(
      'log-fatal',
      isDebugModeMiddleware,
      (req, res: {write: (arg0: string) => void; end: () => void}) => {
        this.setFatalFlags()
        for (const [key, value] of Object.entries(logFlags)) {
          res.write(`${key}: ${value}\n`)
        }
        res.end()
      }
    )
    Context.network.registerExternalGet(
      'log-error',
      isDebugModeMiddleware,
      (req, res: {write: (arg0: string) => void; end: () => void}) => {
        this.setErrorFlags()
        for (const [key, value] of Object.entries(logFlags)) {
          res.write(`${key}: ${value}\n`)
        }
        res.end()
      }
    )
    Context.network.registerExternalGet(
      'log-default',
      isDebugModeMiddleware,
      (req, res: {write: (arg0: string) => void; end: () => void}) => {
        this.setDefaultFlags()
        for (const [key, value] of Object.entries(logFlags)) {
          res.write(`${key}: ${value}\n`)
        }
        res.end()
      }
    )

    // DO NOT USE IN LIVE NETWORK
    Context.network.registerExternalGet(
      'log-default-all',
      isDebugModeMiddleware,
      (req, res: {write: (arg0: string) => void; end: () => void}) => {
        this.setDefaultFlags()

        try {
          const activeNodes = Context.p2p.state.getNodes()
          if (activeNodes) {
            for (const node of activeNodes.values()) {
              this._internalHackGet(
                `${node.externalIp}:${node.externalPort}/log-default`
              )
              res.write(`${node.externalIp}:${node.externalPort}/log-default\n`)
            }
          }
          res.write('joining nodes...\n')
          const joiningNodes = Context.p2p.state.getNodesRequestingJoin()
          if (joiningNodes) {
            for (const node of joiningNodes.values()) {
              this._internalHackGet(
                `${node.externalIp}:${node.externalPort}/log-default`
              )
              res.write(`${node.externalIp}:${node.externalPort}/log-default\n`)
            }
          }

          res.write('sending default logs to all nodes\n')
        } catch (e) {
          res.write(`${e}\n`)
        }

        res.end()
      }
    )

    // DO NOT USE IN LIVE NETWORK
    Context.network.registerExternalGet(
      'log-fatal-all',
      isDebugModeMiddleware,
      (req, res: {write: (arg0: string) => void; end: () => void}) => {
        this.setFatalFlags()
        try {
          const activeNodes = Context.p2p.state.getNodes()
          if (activeNodes) {
            for (const node of activeNodes.values()) {
              this._internalHackGet(
                `${node.externalIp}:${node.externalPort}/log-fatal`
              )
              res.write(`${node.externalIp}:${node.externalPort}/log-fatal\n`)
            }
          }
          res.write('joining nodes...\n')
          const joiningNodes = Context.p2p.state.getNodesRequestingJoin()
          if (joiningNodes) {
            for (const node of joiningNodes.values()) {
              this._internalHackGet(
                `${node.externalIp}:${node.externalPort}/log-fatal`
              )
              res.write(`${node.externalIp}:${node.externalPort}/log-fatal\n`)
            }
          }
          res.write('sending fatal logs to all nodes\n')
        } catch (e) {
          res.write(`${e}\n`)
        }
        res.end()
      }
    )
  }

  _containsProtocol(url: string) {
    if (!url.match('https?://*')) return false
    return true
  }

  _normalizeUrl(url: string) {
    let normalized = url
    if (!this._containsProtocol(url)) normalized = 'http://' + url
    return normalized
  }
  async _internalHackGet(url: string) {
    const normalized = this._normalizeUrl(url)
    const host = new URL(normalized)
    try {
      await got.get(host, {
        timeout: 1000,
        retry: 0,
        throwHttpErrors: false,
        //parseJson: (text:string)=>{},
        //json: false, // the whole reason for _internalHackGet was because we dont want the text response to mess things up
        //  and as a debug non shipping endpoint did not want to add optional parameters to http module
      })
      // eslint-disable-next-line no-empty
    } catch (e) {}
  }
  async _internalHackGetWithResp(url: string) {
    const normalized = this._normalizeUrl(url)
    const host = new URL(normalized)
    try {
      const res = await got.get(host, {
        timeout: 7000,
        retry: 0,
        throwHttpErrors: false,
        //parseJson: (text:string)=>{},
        //json: false, // the whole reason for _internalHackGet was because we dont want the text response to mess things up
        //  and as a debug non shipping endpoint did not want to add optional parameters to http module
      })

      return res
    } catch (e) {
      return null
    }
  }

  setupLogControlValues() {
    logFlags.fatal = true

    const mainLogger = this.getLogger('main')
    if (typeof mainLogger.level !== 'string') {
      if (
        mainLogger &&
        ['TRACE', 'trace'].includes(mainLogger.level.levelStr)
      ) {
        logFlags.verbose = true
        logFlags.debug = true
        logFlags.info = true
        logFlags.error = true
      } else if (
        mainLogger &&
        ['DEBUG', 'debug'].includes(mainLogger.level.levelStr)
      ) {
        logFlags.verbose = false
        logFlags.debug = true
        logFlags.info = true
        logFlags.error = true
      } else if (
        mainLogger &&
        ['INFO', 'info'].includes(mainLogger.level.levelStr)
      ) {
        logFlags.verbose = false
        logFlags.debug = false
        logFlags.info = true
        logFlags.error = true
      } else if (
        mainLogger &&
        ['ERROR', 'error', 'WARN', 'warn'].includes(mainLogger.level.levelStr)
      ) {
        logFlags.verbose = false
        logFlags.debug = false
        logFlags.info = true
        logFlags.error = true
      } else {
        logFlags.verbose = false
        logFlags.debug = false
        logFlags.info = false
        logFlags.error = false
        //would still get warn..
      }
    }

    const playbackLogger = this.getLogger('playback')
    if (typeof playbackLogger.level !== 'string') {
      logFlags.playback = false
      if (playbackLogger) {
        logFlags.playback_trace = ['TRACE'].includes(
          playbackLogger.level.levelStr
        )
        logFlags.playback_debug = ['DEBUG'].includes(
          playbackLogger.level.levelStr
        )
        if (logFlags.playback_trace || logFlags.playback_debug) {
          logFlags.playback = true
        } else {
          logFlags.playback = false
        }
      }
    }

    const netLogger = this.getLogger('net')
    if (typeof netLogger.level !== 'string') {
      if (netLogger && ['TRACE', 'trace'].includes(netLogger.level.levelStr)) {
        logFlags.net_trace = true
      }
    }

    const p2pLogger = this.getLogger('p2p')
    if (typeof p2pLogger.level !== 'string') {
      if (p2pLogger && ['FATAL', 'fatal'].includes(p2pLogger.level.levelStr)) {
        logFlags.p2pNonFatal = false
      } else {
        logFlags.p2pNonFatal = true
      }
    }

    this.backupLogFlags = utils.deepCopy(logFlags)

    console.log('logFlags: ' + stringify(logFlags))
  }
}

export default Logger
