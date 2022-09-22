import { newMockEvent } from "matchstick-as"
import { ethereum, Bytes, BigInt, Address } from "@graphprotocol/graph-ts"
import {
  Activated,
  CollateralAdded,
  CollateralReduced,
  Created,
  Deactivated,
  Executed,
  Initialized,
  OwnershipTransferred,
  PositionCreated,
  PositionsClosed,
  Redeemed
} from "../generated/RoboCop/RoboCop"

export function createActivatedEvent(ruleHash: Bytes): Activated {
  let activatedEvent = changetype<Activated>(newMockEvent())

  activatedEvent.parameters = new Array()

  activatedEvent.parameters.push(
    new ethereum.EventParam("ruleHash", ethereum.Value.fromFixedBytes(ruleHash))
  )

  return activatedEvent
}

export function createCollateralAddedEvent(
  ruleHash: Bytes,
  amounts: Array<BigInt>
): CollateralAdded {
  let collateralAddedEvent = changetype<CollateralAdded>(newMockEvent())

  collateralAddedEvent.parameters = new Array()

  collateralAddedEvent.parameters.push(
    new ethereum.EventParam("ruleHash", ethereum.Value.fromFixedBytes(ruleHash))
  )
  collateralAddedEvent.parameters.push(
    new ethereum.EventParam(
      "amounts",
      ethereum.Value.fromUnsignedBigIntArray(amounts)
    )
  )

  return collateralAddedEvent
}

export function createCollateralReducedEvent(
  ruleHash: Bytes,
  amounts: Array<BigInt>
): CollateralReduced {
  let collateralReducedEvent = changetype<CollateralReduced>(newMockEvent())

  collateralReducedEvent.parameters = new Array()

  collateralReducedEvent.parameters.push(
    new ethereum.EventParam("ruleHash", ethereum.Value.fromFixedBytes(ruleHash))
  )
  collateralReducedEvent.parameters.push(
    new ethereum.EventParam(
      "amounts",
      ethereum.Value.fromUnsignedBigIntArray(amounts)
    )
  )

  return collateralReducedEvent
}

export function createCreatedEvent(ruleHash: Bytes): Created {
  let createdEvent = changetype<Created>(newMockEvent())

  createdEvent.parameters = new Array()

  createdEvent.parameters.push(
    new ethereum.EventParam("ruleHash", ethereum.Value.fromFixedBytes(ruleHash))
  )

  return createdEvent
}

export function createDeactivatedEvent(ruleHash: Bytes): Deactivated {
  let deactivatedEvent = changetype<Deactivated>(newMockEvent())

  deactivatedEvent.parameters = new Array()

  deactivatedEvent.parameters.push(
    new ethereum.EventParam("ruleHash", ethereum.Value.fromFixedBytes(ruleHash))
  )

  return deactivatedEvent
}

export function createExecutedEvent(
  ruleHash: Bytes,
  executor: Address
): Executed {
  let executedEvent = changetype<Executed>(newMockEvent())

  executedEvent.parameters = new Array()

  executedEvent.parameters.push(
    new ethereum.EventParam("ruleHash", ethereum.Value.fromFixedBytes(ruleHash))
  )
  executedEvent.parameters.push(
    new ethereum.EventParam("executor", ethereum.Value.fromAddress(executor))
  )

  return executedEvent
}

export function createInitializedEvent(version: i32): Initialized {
  let initializedEvent = changetype<Initialized>(newMockEvent())

  initializedEvent.parameters = new Array()

  initializedEvent.parameters.push(
    new ethereum.EventParam(
      "version",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(version))
    )
  )

  return initializedEvent
}

export function createOwnershipTransferredEvent(
  previousOwner: Address,
  newOwner: Address
): OwnershipTransferred {
  let ownershipTransferredEvent = changetype<OwnershipTransferred>(
    newMockEvent()
  )

  ownershipTransferredEvent.parameters = new Array()

  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam(
      "previousOwner",
      ethereum.Value.fromAddress(previousOwner)
    )
  )
  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  )

  return ownershipTransferredEvent
}

export function createPositionCreatedEvent(
  positionHash: Bytes,
  precursorAction: Bytes,
  nextActions: Bytes
): PositionCreated {
  let positionCreatedEvent = changetype<PositionCreated>(newMockEvent())

  positionCreatedEvent.parameters = new Array()

  positionCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "positionHash",
      ethereum.Value.fromFixedBytes(positionHash)
    )
  )
  positionCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "precursorAction",
      ethereum.Value.fromBytes(precursorAction)
    )
  )
  positionCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "nextActions",
      ethereum.Value.fromBytes(nextActions)
    )
  )

  return positionCreatedEvent
}

export function createPositionsClosedEvent(
  closingAction: Bytes,
  positionHashesClosed: Array<Bytes>
): PositionsClosed {
  let positionsClosedEvent = changetype<PositionsClosed>(newMockEvent())

  positionsClosedEvent.parameters = new Array()

  positionsClosedEvent.parameters.push(
    new ethereum.EventParam(
      "closingAction",
      ethereum.Value.fromBytes(closingAction)
    )
  )
  positionsClosedEvent.parameters.push(
    new ethereum.EventParam(
      "positionHashesClosed",
      ethereum.Value.fromFixedBytesArray(positionHashesClosed)
    )
  )

  return positionsClosedEvent
}

export function createRedeemedEvent(ruleHash: Bytes): Redeemed {
  let redeemedEvent = changetype<Redeemed>(newMockEvent())

  redeemedEvent.parameters = new Array()

  redeemedEvent.parameters.push(
    new ethereum.EventParam("ruleHash", ethereum.Value.fromFixedBytes(ruleHash))
  )

  return redeemedEvent
}
