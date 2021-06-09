import * as shardFunctionTypes from '../../state-manager/shardFunctionTypes';
import { NetworkHash } from '../State';

/** TYPES */

export interface Record {
  networkDataHash: NetworkHash[];
  networkReceiptHash: NetworkHash[];
  networkSummaryHash: NetworkHash[];
}
export interface Account {
  accountId: string;
  hash: string;
}

export type PartitionRanges = Map<
  shardFunctionTypes.AddressRange['partition'],
  shardFunctionTypes.AddressRange
>;

export type PartitionAccounts = Map<
  shardFunctionTypes.AddressRange['partition'],
  Account[]
>;

export type PartitionHashes = Map<
  shardFunctionTypes.AddressRange['partition'],
  string
>;

export type ReceiptMapHashes = Map<
  shardFunctionTypes.AddressRange['partition'],
  string
>;

export type PartitionNum = number;

export enum offerResponse {
  needed = 'needed',
  notNeeded = 'not_needed',
  tryLater = 'try_later',
  sendTo = 'send_to'
}