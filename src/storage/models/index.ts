import acceptedTxs from './acceptedTxs'
import accountsCopy from './accountsCopy'
import accountStates from './accountStates'
import cycles from './cycles'
import globalAccounts from './globalAccounts'
import network from './network'
import networkReceipt from './networkReceipt'
import networkSummary from './networkSummary'
import nodes from './nodes'
import partitions from './partitions'
import properties from './properties'
import receipt from './receipt'
import summary from './summary'

const models = [
  cycles,
  nodes,
  properties,
  acceptedTxs,
  accountStates,
  accountsCopy,
  globalAccounts,
  partitions,
  receipt,
  summary,
  network,
  networkReceipt,
  networkSummary,
]

export default models
