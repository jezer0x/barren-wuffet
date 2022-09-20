import { Position, Rule } from "../generated/schema";
import {
  Activated as ActivatedEvent,
  CollateralAdded as CollateralAddedEvent,
  CollateralReduced as CollateralReducedEvent,
  Created as CreatedEvent,
  Deactivated as DeactivatedEvent,
  Executed as ExecutedEvent,
  Initialized as InitializedEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  PositionCreated as PositionCreatedEvent,
  PositionsClosed as PositionsClosedEvent,
  Redeemed as RedeemedEvent,
  RoboCop as RoboCopContract
} from "../generated/templates/RoboCop/RoboCop";

export function handleActivated(event: ActivatedEvent): void {
  let rule = Rule.load(event.params.ruleHash);
  if (!rule) {
    throw Error;
  }
  let ts_arr = rule.activation_timestamps;
  ts_arr.push(event.block.timestamp);
  rule.activation_timestamps = ts_arr;
  rule.save();
}

export function handleCollateralAdded(event: CollateralAddedEvent): void {}

export function handleCollateralReduced(event: CollateralReducedEvent): void {}

export function handleCreated(event: CreatedEvent): void {
  let fund = RoboCopContract.bind(event.address).owner();
  let rule = new Rule(event.params.ruleHash);
  rule.creation_timestamp = event.block.timestamp;
  rule.activation_timestamps = [];
  rule.deactivation_timestamps = [];
  rule.fund = fund;
  rule.save();
}

export function handleDeactivated(event: DeactivatedEvent): void {
  let rule = Rule.load(event.params.ruleHash);
  if (!rule) {
    throw Error;
  }
  let ts_arr = rule.deactivation_timestamps;
  ts_arr.push(event.block.timestamp);
  rule.deactivation_timestamps = ts_arr;
  rule.save();
}

export function handleExecuted(event: ExecutedEvent): void {
  let rule = Rule.load(event.params.ruleHash);
  if (!rule) {
    throw Error;
  }
  rule.execution_timestamp = event.block.timestamp;
  rule.save();
}

export function handleInitialized(event: InitializedEvent): void {}

export function handleOwnershipTransferred(event: OwnershipTransferredEvent): void {}

export function handlePositionCreated(event: PositionCreatedEvent): void {
  let fund = RoboCopContract.bind(event.address).owner();
  let position = new Position(event.params.positionHash);
  position.next_actions = event.params.nextActions;
  position.source = "RoboCop";
  position.fund = fund;
  position.creation_timestamp = event.block.timestamp;
  position.save();
}

export function handlePositionsClosed(event: PositionsClosedEvent): void {
  var i: i32;
  for (i = 0; i < event.params.positionHashesClosed.length; i++) {
    let position = Position.load(event.params.positionHashesClosed[i]);
    if (!position) {
      throw Error;
    }
    position.closed_timestamp = event.block.timestamp;
    position.save();
  }
}

export function handleRedeemed(event: RedeemedEvent): void {
  let rule = Rule.load(event.params.ruleHash);
  if (!rule) {
    throw Error;
  }
  rule.redemption_timestamp = event.block.timestamp;
  rule.save();
}
