import LoadDetection from '../load-detection'
import {NodeLoad} from '../utils/profiler'
import {nestedCountersInstance} from '../utils/nestedCounters'

interface RateLimiting {
  loadDetection: LoadDetection
  limitRate: boolean
  loadLimit: NodeLoad
}

class RateLimiting {
  constructor(config: RateLimiting, loadDetection: any) {
    this.loadDetection = loadDetection
    this.limitRate = config.limitRate
    this.loadLimit = config.loadLimit
  }

  calculateThrottlePropotion(load: number, limit: number) {
    const throttleRange = 1 - limit
    const throttleAmount = load - limit
    const throttleProportion = throttleAmount / throttleRange
    return throttleProportion
  }

  getWinningLoad(nodeLoad: {}, queueLoad: {}) {
    const loads = {...nodeLoad, ...queueLoad}
    let maxThrottle = 0
    let loadType: any
    for (const _key in loads) {
      //this trick fix alot of TS errors
      const key = _key as keyof typeof loads

      if (this.loadLimit[key] === null) {
        continue //not checking load limit for undefined or 0 limit.
      }
      if (loads[key] < this.loadLimit[key]) continue
      const throttle = this.calculateThrottlePropotion(
        loads[key],
        this.loadLimit[key]
      )

      nestedCountersInstance.countEvent(
        'loadRelated',
        `ratelimit reached: ${key} > ${this.loadLimit[key]}`
      )
      if (throttle > maxThrottle) {
        maxThrottle = throttle
        loadType = key
      }
    }

    if (loadType) {
      nestedCountersInstance.countEvent(
        'loadRelated',
        `ratelimit winning load factor: ${loadType}`
      )
    }

    return {
      throttle: maxThrottle,
      loadType,
    }
  }

  isOverloaded() {
    if (!this.limitRate) return false
    const nodeLoad = this.loadDetection.getCurrentNodeLoad()
    const queueLoad = this.loadDetection.getQueueLoad()

    const {throttle, loadType} = this.getWinningLoad(nodeLoad, queueLoad)

    if (throttle > 0) {
      // TODO: add counter to track max load type
    }
    return Math.random() < throttle
  }
}

export default RateLimiting
