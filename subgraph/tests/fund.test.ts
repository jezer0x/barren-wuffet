import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { Closed } from "../generated/schema"
import { Closed as ClosedEvent } from "../generated/Fund/Fund"
import { handleClosed } from "../src/fund"
import { createClosedEvent } from "./fund-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let fundAddr = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let newClosedEvent = createClosedEvent(fundAddr)
    handleClosed(newClosedEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("Closed created and stored", () => {
    assert.entityCount("Closed", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "Closed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "fundAddr",
      "0x0000000000000000000000000000000000000001"
    )

    // More assert options:
    // https://thegraph.com/docs/en/developer/matchstick/#asserts
  })
})
