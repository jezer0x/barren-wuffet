import {
  Closed as ClosedEvent,
  Deposit as DepositEvent,
  Initialized as InitializedEvent,
  Withdraw as WithdrawEvent,
} from "../generated/templates/Fund/Fund";
import { Fund } from "../generated/schema";

export function handleClosed(event: ClosedEvent): void {
  let entity = Fund.load(event.address);

  if (!entity) {
    throw Error;
  }

  entity.closed = true;
  entity.save();
}

export function handleDeposit(event: DepositEvent): void {}

export function handleInitialized(event: InitializedEvent): void {}

export function handleWithdraw(event: WithdrawEvent): void {}
