import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  Closed,
  Deposit,
  Executed,
  Initialized,
  PositionCreated,
  PositionsClosed,
  Withdraw
} from "../generated/Fund/Fund"

export function createClosedEvent(fundAddr: Address): Closed {
  let closedEvent = changetype<Closed>(newMockEvent())

  closedEvent.parameters = new Array()

  closedEvent.parameters.push(
    new ethereum.EventParam("fundAddr", ethereum.Value.fromAddress(fundAddr))
  )

  return closedEvent
}

export function createDepositEvent(
  subscriber: Address,
  subIdx: BigInt,
  token: Address,
  balance: BigInt
): Deposit {
  let depositEvent = changetype<Deposit>(newMockEvent())

  depositEvent.parameters = new Array()

  depositEvent.parameters.push(
    new ethereum.EventParam(
      "subscriber",
      ethereum.Value.fromAddress(subscriber)
    )
  )
  depositEvent.parameters.push(
    new ethereum.EventParam("subIdx", ethereum.Value.fromUnsignedBigInt(subIdx))
  )
  depositEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  )
  depositEvent.parameters.push(
    new ethereum.EventParam(
      "balance",
      ethereum.Value.fromUnsignedBigInt(balance)
    )
  )

  return depositEvent
}

export function createExecutedEvent(action: Bytes): Executed {
  let executedEvent = changetype<Executed>(newMockEvent())

  executedEvent.parameters = new Array()

  executedEvent.parameters.push(
    new ethereum.EventParam("action", ethereum.Value.fromBytes(action))
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

export function createWithdrawEvent(
  subscriber: Address,
  subIdx: BigInt,
  token: Address,
  balance: BigInt
): Withdraw {
  let withdrawEvent = changetype<Withdraw>(newMockEvent())

  withdrawEvent.parameters = new Array()

  withdrawEvent.parameters.push(
    new ethereum.EventParam(
      "subscriber",
      ethereum.Value.fromAddress(subscriber)
    )
  )
  withdrawEvent.parameters.push(
    new ethereum.EventParam("subIdx", ethereum.Value.fromUnsignedBigInt(subIdx))
  )
  withdrawEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  )
  withdrawEvent.parameters.push(
    new ethereum.EventParam(
      "balance",
      ethereum.Value.fromUnsignedBigInt(balance)
    )
  )

  return withdrawEvent
}
