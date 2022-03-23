import * as crypto from '@shardus/crypto-utils'
import {ChildProcess, fork} from 'child_process'
import * as Log4js from 'log4js'
import Logger from '../logger'
import * as Shardus from '../shardus/shardus-types'
import Storage from '../storage'

interface Crypto {
  config: Shardus.ServerConfiguration
  mainLogger: Log4js.Logger
  storage: Storage
  keypair: crypto.Keypair
  curveKeypair: {
    publicKey: crypto.curvePublicKey
    secretKey: crypto.curveSecretKey
  }
  powGenerators: {[name: string]: ChildProcess}
  sharedKeys: {[name: string]: Buffer}
}

class Crypto {
  constructor(
    config: Shardus.ServerConfiguration,
    logger: Logger,
    storage: Storage
  ) {
    this.config = config
    this.mainLogger = logger.getLogger('main')
    this.storage = storage
  }

  async init() {
    if (typeof this?.config?.crypto?.hashKey !== 'string') {
      throw new Error('config.server.crypto.hashKey is not a string.')
    }
    crypto.init(this.config.crypto.hashKey)
    this.keypair = await this.storage.getProperty('keypair')
    if (isKeypair(this.keypair) === false) {
      this.mainLogger.info(
        'Keypair unable to be loaded from database. Generating new keypair...'
      )
      this.keypair = this._generateKeypair()
      await this.storage.setProperty('keypair', this.keypair)
      this.mainLogger.info(
        'New keypair successfully generated and saved to database.'
      )
    } else {
      this.mainLogger.info('Keypair loaded successfully from database.')
    }
    this.curveKeypair = {
      secretKey: crypto.convertSkToCurve(this.keypair.secretKey),
      publicKey: crypto.convertPkToCurve(this.keypair.publicKey),
    }
  }

  _generateKeypair() {
    const keypair = crypto.generateKeypair()
    this.mainLogger.info('New keypair generated.')
    return keypair
  }

  convertPublicKeyToCurve(pk: crypto.publicKey) {
    return crypto.convertPkToCurve(pk)
  }

  getPublicKey() {
    return this.keypair.publicKey
  }

  getCurvePublicKey() {
    return this.curveKeypair.publicKey
  }

  getSharedKey(curvePk: crypto.curvePublicKey) {
    let sharedKey = this.sharedKeys[curvePk]
    if (!sharedKey) {
      sharedKey = crypto.generateSharedKey(this.curveKeypair.secretKey, curvePk)
      this.sharedKeys[curvePk] = sharedKey
    }
    return sharedKey
  }

  tag(obj: crypto.LooseObject, recipientCurvePk: crypto.curvePublicKey) {
    const objCopy = JSON.parse(crypto.stringify(obj))
    const sharedKey = this.getSharedKey(recipientCurvePk)
    crypto.tagObj(objCopy, sharedKey)
    return objCopy
  }

  authenticate(obj: crypto.TaggedObject, senderCurvePk: crypto.curvePublicKey) {
    const sharedKey = this.getSharedKey(senderCurvePk)
    return crypto.authenticateObj(obj, sharedKey)
  }

  sign(obj: crypto.LooseObject) {
    const objCopy = JSON.parse(crypto.stringify(obj))
    crypto.signObj(objCopy, this.keypair.secretKey, this.keypair.publicKey)
    return objCopy
  }

  verify(obj: crypto.SignedObject, expectedPk?: string | undefined) {
    if (expectedPk) {
      if (obj.sign.owner !== expectedPk) return false
    }
    return crypto.verifyObj(obj)
  }

  hash(obj: crypto.LooseObject) {
    if (!obj.sign) {
      return crypto.hashObj(obj)
    }
    return crypto.hashObj(obj, true)
  }

  isGreaterHash(hash1: string | number, hash2: string | number) {
    return hash1 > hash2
  }

  getComputeProofOfWork(seed: string, difficulty: number) {
    return this._runProofOfWorkGenerator(
      './computePowGenerator.js',
      seed,
      difficulty
    )
  }

  stopAllGenerators() {
    // tslint:disable-next-line: forin
    for (const generator in this.powGenerators) {
      this.powGenerators[generator].kill()
    }
    this.powGenerators = {}
  }

  _runProofOfWorkGenerator(
    generator: string,
    seed: string,
    difficulty: number
  ) {
    // Fork a child process to compute the PoW, if it doesn't exist
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore for seems to have a funky definition so ignoring it for now.  could be good to go back and research this.
    if (!this.powGenerators[generator]) {
      this.powGenerators[generator] = fork(generator, undefined, {
        cwd: __dirname,
      })
    }
    const promise = new Promise(resolve => {
      this.powGenerators[generator].on('message', powObj => {
        this._stopProofOfWorkGenerator(generator)
        resolve(powObj)
      })
    })
    // Tell child to compute PoW
    if (!this.powGenerators[generator].killed) {
      this.powGenerators[generator].send({seed, difficulty})
    }
    // Return a promise the resolves to a valid { nonce, hash }
    return promise
  }

  _stopProofOfWorkGenerator(generator: string) {
    if (!this.powGenerators[generator]) return Promise.resolve('not running')
    const promise = new Promise(resolve => {
      this.powGenerators[generator].on('close', signal => {
        delete this.powGenerators[generator]
        resolve(signal)
      })
    })
    if (!this.powGenerators[generator].killed) {
      this.powGenerators[generator].kill()
    }
    return promise
  }
}

function isKeypair(keypair: unknown): keypair is crypto.Keypair {
  if (typeof (keypair as crypto.Keypair)?.publicKey !== 'string') return false
  if (typeof (keypair as crypto.Keypair)?.secretKey !== 'string') return false
  return true
}

// tslint:disable-next-line: no-default-export
export default Crypto
