const NodeEnvironment = require('jest-environment-node')

/**
 * Jest 27's node environment does not advertise the `node` export condition.
 * Packages like require-addon (used by sodium-native 5+) resolve to a Bare stub
 * without it. Mirror Jest 28+ defaults so Node conditional exports work.
 */
class NodeEnvironmentWithNodeExports extends NodeEnvironment {
  exportConditions() {
    return ['node', 'node-addons']
  }
}

module.exports = NodeEnvironmentWithNodeExports
