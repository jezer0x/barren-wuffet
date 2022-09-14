import { assert, describe, test, clearStore, beforeAll, afterAll } from "matchstick-as/assembly/index";
import { Address } from "@graphprotocol/graph-ts";
import { Fund } from "../generated/schema";
import { Created } from "../generated/BarrenWuffet/BarrenWuffet";
import { handleCreated } from "../src/barren-wuffet";
import { createCreatedEvent } from "./barren-wuffet-utils";

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let manager = Address.fromString("0x0000000000000000000000000000000000000001");
    let fundAddr = Address.fromString("0x0000000000000000000000000000000000000001");
    let newCreatedEvent = createCreatedEvent(manager, fundAddr);
    handleCreated(newCreatedEvent);
  });

  afterAll(() => {
    clearStore();
  });

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("Fund created and stored", () => {
    assert.entityCount("Fund", 1);

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "Fund",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "manager",
      "0x0000000000000000000000000000000000000001"
    );
    assert.fieldEquals(
      "Fund",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a",
      "fundAddr",
      "0x0000000000000000000000000000000000000001"
    );

    // More assert options:
    // https://thegraph.com/docs/en/developer/matchstick/#asserts
  });
});
