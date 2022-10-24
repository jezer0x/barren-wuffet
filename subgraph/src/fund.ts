import {
  Closed as ClosedEvent,
  Deposit as DepositEvent,
  Executed as ExecutedEvent,
  Initialized as InitializedEvent,
  Withdraw as WithdrawEvent,
  Fund as FundContract
} from "../generated/templates/Fund/Fund";
import { Action, Fund, Position, Sub } from "../generated/schema";
import { RoboCop } from "../generated/templates";

export function handleClosed(event: ClosedEvent): void {
  let entity = Fund.load(event.address);

  if (!entity) {
    throw Error;
  }

  entity.closed_timestamp = event.block.timestamp;

  entity.save();
}

export function handleDeposit(event: DepositEvent): void {
  let entity = Sub.load(event.address.toHexString() + "-" + event.params.subscriber.toString());

  if (!entity) {
    entity = new Sub(event.address.toHexString() + "-" + event.params.subscriber.toString());
    entity.deposit_timestamps = [];
    entity.withdraw_timestamps = [];
    entity.deposit_amounts = [];
  }

  entity.address = event.params.subscriber;

  let ts_arr = entity.deposit_timestamps;
  ts_arr.push(event.block.timestamp);
  entity.deposit_timestamps = ts_arr;

  let amt_arr = entity.deposit_amounts;
  amt_arr.push(event.params.balance);
  entity.deposit_amounts = amt_arr;

  entity.fund = event.address;

  entity.save();
}

export function handleExecuted(event: ExecutedEvent): void {
  let entity = new Action(event.transaction.hash.toHex() + "-" + event.logIndex.toString());
  entity.action = event.params.action;
  entity.timestamp = event.block.timestamp;
  entity.fund = event.address;

  entity.save();
}

export function handleInitialized(event: InitializedEvent): void {
  let contract = FundContract.bind(event.address);
  let roboCopAddr = contract.roboCop();
  RoboCop.create(roboCopAddr);
}

export function handleWithdraw(event: WithdrawEvent): void {
  let entity = Sub.load(event.address.toHexString() + "-" + event.params.subscriber.toString());
  if (!entity) {
    throw Error;
  }

  let ts_arr = entity.withdraw_timestamps;
  ts_arr.push(event.block.timestamp);
  entity.withdraw_timestamps = ts_arr;

  entity.save();
}
