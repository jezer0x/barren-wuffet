import {
  Closed as ClosedEvent,
  Deposit as DepositEvent,
  Executed as ExecutedEvent,
  Initialized as InitializedEvent,
  PositionCreated as PositionCreatedEvent,
  PositionsClosed as PositionsClosedEvent,
  Withdraw as WithdrawEvent,
  Fund as FundContract,
} from "../generated/templates/Fund/Fund";
import { Fund } from "../generated/schema";
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
  let entity = Fund.load(event.address);

  if (!entity) {
    throw Error;
  }

  entity.subscribers.push(event.params.subscriber);
  entity.save();
}

export function handleExecuted(event: ExecutedEvent): void {
  let entity = Fund.load(event.address);

  if (!entity) {
    throw Error;
  }

  entity.actions.push(event.params.action);
  entity.save();
}

export function handleInitialized(event: InitializedEvent): void {
  let contract = FundContract.bind(event.address);
  let roboCopAddr = contract.roboCop();
  RoboCop.create(roboCopAddr);
}

export function handlePositionCreated(event: PositionCreatedEvent): void {}

export function handlePositionsClosed(event: PositionsClosedEvent): void {}

export function handleWithdraw(event: WithdrawEvent): void {}
