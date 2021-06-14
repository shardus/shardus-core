import deepmerge from 'deepmerge'
import * as CycleCreator from './CycleCreator'
import { Changer, CycleCreatorTypes } from 'shardus-parser'

export function parse(record: CycleCreatorTypes.CycleRecord): Changer.Change {
  const changes = CycleCreator.submodules.map(submodule =>
    submodule.parseRecord(record)
  )
  const mergedChange = deepmerge.all<Changer.Change>(changes)
  return mergedChange
}
