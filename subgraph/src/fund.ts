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
import { Fund, Position } from "../generated/schema";
import { RoboCop } from "../generated/templates";
import { Bytes } from "@graphprotocol/graph-ts";

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

export function handlePositionCreated(event: PositionCreatedEvent): void {
  let fund = Fund.load(event.address);

  if (!fund) {
    throw Error;
  }

  let position = new Position(event.params.positionHash);
  position.next_actions = event.params.nextActions;

  fund.fund_pending_positions.push(position.id);

  position.save();
  fund.save();
}

export function handlePositionsClosed(event: PositionsClosedEvent): void {
  let fund = Fund.load(event.address);

  if (!fund) {
    throw Error;
  }

  event.params.positionHashesClosed.forEach(function(positionHash) {
    removeFromPendingPositions(fund.fund_pending_positions, positionHash);
  });

  fund.save();
}

export function handleWithdraw(event: WithdrawEvent): void {}

function removeFromPendingPositions(arr: Bytes[], hash: Bytes) {
  var i: number;
  for (i = 0; i < arr.length; i++) {
    if (arr[i] == hash) {
      arr[i] = arr[arr.length - 1];
      arr.pop();
      break;
    }
  }
}
