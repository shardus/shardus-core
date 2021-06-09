import deepmerge from 'deepmerge'
import * as CycleCreator from './CycleCreator'
import { CycleRecord } from "../shared-types/Cycle/CycleCreatorTypes"
import { Change } from '../shared-functions/Cycle'

export function parse(record: CycleRecord): Change {
  const changes = CycleCreator.submodules.map(submodule =>
    submodule.parseRecord(record)
  )
  const mergedChange = deepmerge.all<Change>(changes)
  return mergedChange
}
