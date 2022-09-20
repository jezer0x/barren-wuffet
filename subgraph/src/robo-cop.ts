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

export function handleActivated(event: ActivatedEvent): void {}

export function handleCollateralAdded(event: CollateralAddedEvent): void {}

export function handleCollateralReduced(event: CollateralReducedEvent): void {}

export function handleCreated(event: CreatedEvent): void {}

export function handleDeactivated(event: DeactivatedEvent): void {}

export function handleExecuted(event: ExecutedEvent): void {}

export function handleInitialized(event: InitializedEvent): void {}

export function handleOwnershipTransferred(event: OwnershipTransferredEvent): void {}

export function handlePositionCreated(event: PositionCreatedEvent): void {}

export function handlePositionsClosed(event: PositionsClosedEvent): void {}

export function handleRedeemed(event: RedeemedEvent): void {}
