import { addSchema } from '../../utils/serialization/SchemaHelpers'
const schemaSpreadTxToGroupSyncingReq = {
  type: 'object',
  properties: {
    timestamp: { type: 'number' },
    txId: { type: 'string' },
    keys: { type: 'object' },
    data: { type: 'object' },
    appData: { type: 'object' },
    shardusMemoryPatterns: { type: 'object' },
  },
  required: ['timestamp', 'txId', 'keys', 'data', 'appData', 'shardusMemoryPatterns'],
}

export function initSpreadTxToGroupSyncingReq(): void {
    addSchemaDependencies()
    addSchemas()
  }
  
  function addSchemaDependencies(): void {
  }
  
  // Function to register the schema
  function addSchemas(): void {
    addSchema('SpreadTxToGroupSyncingReq', schemaSpreadTxToGroupSyncingReq)
  }
  