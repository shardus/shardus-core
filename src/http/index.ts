import * as got from 'got'
import {URL} from 'url'
import Logger from '../logger'

let _logger: Logger
let getIndex = 1
let postIndex = -1

function _containsProtocol(url: string) {
  if (!url.match('https?://*')) return false
  return true
}

function _normalizeUrl(url: string) {
  let normalized = url
  if (!_containsProtocol(url)) normalized = 'http://' + url
  return normalized
}

async function _get(url: got.GotUrl, getResponseObj = false) {
  const res = await got.get(url, {
    timeout: 1000, //  Omar - setting this to 1 sec
    retry: 0, // Omar - setting this to 0.
    json: true,
  })
  if (getResponseObj) return res
  return res.body
}

/*
  Queries the given host for a JSON payload
  Returns a promise, resolves parsed JSON response
*/
async function get(url: string, getResponseObj = false) {
  const normalized = _normalizeUrl(url)
  const host = new URL(normalized)

  if (_logger) {
    _logger.playbackLog(
      'self',
      host.hostname + ':' + host.port,
      'HttpRequest',
      host.pathname,
      getIndex,
      ''
    )
  }

  const res = await _get(host, getResponseObj)

  if (_logger) {
    _logger.playbackLog(
      host.hostname + ':' + host.port,
      'self',
      'HttpResponseRecv',
      host.pathname,
      getIndex,
      res
    )
  }

  getIndex++
  return res
}

async function _post(
  host: got.GotUrl,
  payload: {[key: string]: unknown},
  getResponseObj = false,
  timeout = 1000
) {
  const res = await got.post(host, {
    timeout: timeout, // Omar - set this to 1 sec
    retry: 0, // Omar - set this to 0
    json: true,
    body: payload,
  })
  if (getResponseObj) return res
  return res.body
}

/*
  Posts a JSON payload to a given host
  Returns a promise, resolves parsed JSON response if successful, rejects on error
*/
async function post(
  givenHost: string,
  body: {[key: string]: unknown},
  getResponseObj = false,
  timeout = 1000
) {
  const normalized = _normalizeUrl(givenHost)
  const host = new URL(normalized)
  if (_logger) {
    _logger.playbackLog(
      'self',
      host.hostname + ':' + host.port,
      'HttpRequest',
      host.pathname,
      postIndex,
      body
    )
  }

  const res = await _post(host, body, getResponseObj, timeout)

  if (_logger) {
    _logger.playbackLog(
      host.hostname + ':' + host.port,
      'self',
      'HttpResponseRecv',
      host.pathname,
      postIndex,
      res
    )
  }

  postIndex--
  return res
}

function setLogger(logger: Logger) {
  _logger = logger
}

export {get, post, setLogger}
