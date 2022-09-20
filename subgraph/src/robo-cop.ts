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
  Redeemed as RedeemedEvent
} from "../generated/templates/RoboCop/RoboCop";
import { Fund, Position } from "../generated/schema";
import { Bytes } from "@graphprotocol/graph-ts";

export function handleActivated(event: ActivatedEvent): void {}

export function handleCollateralAdded(event: CollateralAddedEvent): void {}

export function handleCollateralReduced(event: CollateralReducedEvent): void {}

export function handleCreated(event: CreatedEvent): void {
  let entity = Fund.load(event.address);

  if (!entity) {
    throw Error;
  }

  entity.rules.push(event.params.ruleHash);
  entity.save();
}

export function handleDeactivated(event: DeactivatedEvent): void {}

export function handleExecuted(event: ExecutedEvent): void {}

export function handleInitialized(event: InitializedEvent): void {}

export function handleOwnershipTransferred(event: OwnershipTransferredEvent): void {}

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

export function handleRedeemed(event: RedeemedEvent): void {}

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
