import { AppHeader } from '@shardus/net/build/src/types'
import { Sign } from '../shardus/shardus-types'
import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { ResponseError } from './WrappedResp'

export declare type InternalBinaryHandler<Payload = unknown, Response = unknown> = (
  payload: Payload,
  respond: <T>(
    response?: T,
    serializerFunc?: T extends undefined ? undefined : (stream: VectorBufferStream, obj: Response, root?: boolean) => void,
    responseError?: ResponseError,
    header?: AppHeader
  ) => void,
  header: AppHeader,
  sign: Sign
) => void

