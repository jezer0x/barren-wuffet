import {
  Closed as ClosedEvent,
  Deposit as DepositEvent,
  Initialized as InitializedEvent,
  Withdraw as WithdrawEvent,
  Fund as FundContract
} from "../generated/templates/Fund/Fund";
import { Fund, Sub } from "../generated/schema";
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
  let subscription = Sub.load(event.address.toHexString() + "-" + event.params.subscriber.toHexString());

  if (!subscription) {
    subscription = new Sub(event.address.toHexString() + "-" + event.params.subscriber.toHexString());
    subscription.deposit_timestamps = [];
    subscription.withdraw_timestamps = [];
    subscription.deposit_amounts = [];
  }

  subscription.address = event.params.subscriber;

  let ts_arr = subscription.deposit_timestamps;
  ts_arr.push(event.block.timestamp);
  subscription.deposit_timestamps = ts_arr;

  let amt_arr = subscription.deposit_amounts;
  amt_arr.push(event.params.balance);
  subscription.deposit_amounts = amt_arr;

  subscription.fund = event.address;

  subscription.save();

  let fund = Fund.load(event.address);

  if (!fund) {
    throw Error;
  }

  fund.total_collateral_raised = FundContract.bind(event.address)
    .subStuff()
    .getTotalCollateral();
  fund.save();
}

export function handleInitialized(event: InitializedEvent): void {
  let contract = FundContract.bind(event.address);
  let roboCopAddr = contract.roboCop();
  RoboCop.create(roboCopAddr);
}

export function handleWithdraw(event: WithdrawEvent): void {
  let subscription = Sub.load(event.address.toHexString() + "-" + event.params.subscriber.toHexString());
  if (!subscription) {
    throw Error;
  }

  let ts_arr = subscription.withdraw_timestamps;
  ts_arr.push(event.block.timestamp);
  subscription.withdraw_timestamps = ts_arr;

  subscription.save();

  let fund = Fund.load(event.address);

  if (!fund) {
    throw Error;
  }

  fund.total_collateral_raised = FundContract.bind(event.address)
    .subStuff()
    .getTotalCollateral();
  fund.save();
}
