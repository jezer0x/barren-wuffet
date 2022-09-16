import {
  Closed as ClosedEvent,
  Deposit as DepositEvent,
  Executed as ExecutedEvent,
  Initialized as InitializedEvent,
  Withdraw as WithdrawEvent,
} from "../generated/templates/Fund/Fund";
import { Fund } from "../generated/schema";

export function handleClosed(event: ClosedEvent): void {
  let entity = Fund.load(event.address);

  if (!entity) {
    throw Error;
  }

  entity.closed_timestamp = event.block.timestamp;
  entity.save();
}

export function handleDeposit(event: DepositEvent): void {}

export function handleExecuted(event: ExecutedEvent): void {
  let entity = Fund.load(event.address);

  if (!entity) {
    throw Error;
  }

  entity.actions.push(event.params.action);
  entity.save();
}

export function handleInitialized(event: InitializedEvent): void {}

export function handleWithdraw(event: WithdrawEvent): void {}
