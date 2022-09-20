import {
  Closed as ClosedEvent,
  Deposit as DepositEvent,
  Executed as ExecutedEvent,
  Initialized as InitializedEvent,
  PositionCreated as PositionCreatedEvent,
  PositionsClosed as PositionsClosedEvent,
  Withdraw as WithdrawEvent,
  Fund as FundContract
} from "../generated/templates/Fund/Fund";
import { Action, Fund, Position, Subscription } from "../generated/schema";
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
  let entity = Subscription.load(getIDFromSubscriptionEvent(event));

  if (!entity) {
    entity = new Subscription(getIDFromSubscriptionEvent(event));
  }

  entity.address = event.params.subscriber;
  entity.idx = event.params.subIdx;
  entity.deposit_timestamp = event.block.timestamp;
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

export function handlePositionCreated(event: PositionCreatedEvent): void {
  let fund = Fund.load(event.address);

  if (!fund) {
    throw Error;
  }

  let position = new Position(event.params.positionHash);
  position.next_actions = event.params.nextActions;
  position.source = "Fund";
  position.fund = event.address;
  position.creation_timestamp = event.block.timestamp;

  position.save();
}

export function handlePositionsClosed(event: PositionsClosedEvent): void {
  event.params.positionHashesClosed.forEach(function(positionHash) {
    let position = Position.load(positionHash);
    if (!position) {
      throw Error;
    }
    position.closed_timestamp = event.block.timestamp;
    position.save();
  });
}

export function handleWithdraw(event: WithdrawEvent): void {
  let entity = Subscription.load(getIDFromSubscriptionEvent(event));
  if (!entity) {
    throw Error;
  }
  entity.withdraw_timestamp = event.block.timestamp;
}

function getIDFromSubscriptionEvent(event: WithdrawEvent | DepositEvent): string {
  return event.address + "-" + event.params.subIdx;
}
