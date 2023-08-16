import { logger } from '../Context'
import { Logger } from 'log4js'

let mainLogger: Logger
let p2pLogger: Logger

export function initLogger(): void {
  mainLogger = logger.getLogger('main')
}

export function getMainLogger(): Logger {
  return mainLogger
}

export function info(...msg: unknown[]): void {
  const entry = `Sync: ${msg.join(' ')}`
  p2pLogger.info(entry)
}

export function warn(...msg: unknown[]): void {
  const entry = `Sync: ${msg.join(' ')}`
  p2pLogger.warn(entry)
}

export function error(...msg: unknown[]): void {
  const entry = `Sync: ${msg.join(' ')}`
  p2pLogger.error(entry)
}
