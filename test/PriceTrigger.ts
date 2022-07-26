import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployments, ethers } from "hardhat";
import { setupPriceTrigger, setupEthToTst1PriceTrigger } from "./Fixtures";
import { TriggerStruct } from "../typechain-types/contracts/rules/RoboCop";
import { TriggerReturnStruct } from "../typechain-types/contracts/triggers/PriceTrigger";
import { GT, LT, TST1_PRICE_IN_ETH, ETH_ADDRESS, PRICE_TRIGGER_TYPE } from "./Constants";
import { expectEthersObjDeepEqual } from "./helper";

describe("PriceTrigger", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.

  const deployPriceTriggerFixture = deployments.createFixture(async (env, options) => {
    await deployments.fixture(["Triggers"]);
    return await setupPriceTrigger();
  });

  const deployEthtoTst1TriggerFixture = deployments.createFixture(async (env, options) => {
    await deployments.fixture(["Triggers"]);
    return await setupEthToTst1PriceTrigger();
  });

  describe("Deployment", () => {
    it("Should set the right ownerWallet", async function () {
      const { priceTrigger, ownerWallet } = await deployPriceTriggerFixture();
      expect(await priceTrigger.owner()).to.equal(ownerWallet.address);
    });
  });

  describe("Add Triggers", () => {
    it("Should revert with the right error if called from another account", async () => {
      const [_, otherWallet] = await ethers.getSigners(); // TODO: better way to do this?

      const { priceTrigger } = await deployPriceTriggerFixture();

      // We use lock.connect() to send a transaction from another account
      await expect(
        priceTrigger.connect(otherWallet).addPriceFeed(ETH_ADDRESS, "0xc0ffee254729296a45a3885639AC7E10F9d54979")
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should add a trigger feed if called by the ownerWallet", async () => {
      const { priceTrigger, ownerWallet } = await deployPriceTriggerFixture();

      await priceTrigger.addPriceFeed(ETH_ADDRESS, "0xc0ffee254729296a45a3885639AC7E10F9d54979");
    });
  });

  describe("Validate Trigger", () => {
    it("Should revert if the trigger has only 1 asset", async () => {
      const { priceTrigger, otherWallet } = await deployEthtoTst1TriggerFixture();

      const trigger: TriggerStruct = {
        createTimeParams: ethers.utils.defaultAbiCoder.encode(["address", "uint8", "uint256"], [ETH_ADDRESS, GT, 0]),
        triggerType: PRICE_TRIGGER_TYPE,
        // this is the address of the ITrigger, PriceTrigger.address in this case
        // but we dont expect it to matter within PriceTrigger.
        callee: ETH_ADDRESS,
      };

      await expect(priceTrigger.connect(otherWallet).validate(trigger)).to.be.revertedWithoutReason;
    });

    it("Should revert if the trigger has 2 assets and the datasource is specified incorrectly", async () => {
      const { priceTrigger, otherWallet } = await deployEthtoTst1TriggerFixture();

      const trigger: TriggerStruct = {
        createTimeParams: ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint8", "uint256"],
          [ETH_ADDRESS, "0xc0ffee254729296a45a3885639AC7E10F9d54979", GT, 0] // just insert some random address for the second one
        ),
        triggerType: PRICE_TRIGGER_TYPE,
        // this is the address of the ITrigger, PriceTrigger.address in this case
        // but we dont expect it to matter within PriceTrigger.
        callee: ETH_ADDRESS,
      };

      await expect(priceTrigger.connect(otherWallet).validate(trigger)).to.be.revertedWithoutReason;
    });

    it("Should pass if the trigger has 2 assets and the datasource is specified", async () => {
      const { priceTrigger, otherWallet, testToken1 } = await deployEthtoTst1TriggerFixture();

      const trigger: TriggerStruct = {
        createTimeParams: ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint8", "uint256"],
          [testToken1.address, ETH_ADDRESS, GT, 0]
        ),
        triggerType: PRICE_TRIGGER_TYPE,
        // this is the address of the ITrigger, PriceTrigger.address in this case
        // but we dont expect it to matter within PriceTrigger.
        callee: ETH_ADDRESS,
      };

      expect(await priceTrigger.connect(otherWallet).validate(trigger)).to.equal(true);
    });
  });
  describe("Check Trigger", () => {
    describe(
      "Should pass / fail the trigger based on eth/tst1 limit price. Current eth/tst1 is " + TST1_PRICE_IN_ETH,
      () => {
        [
          [LT, TST1_PRICE_IN_ETH.sub(1), false],
          [GT, TST1_PRICE_IN_ETH.add(1), false],
          [GT, TST1_PRICE_IN_ETH.sub(1), true],
          [LT, TST1_PRICE_IN_ETH.add(1), true],
        ].forEach(([cmp, triggerPrice, pass]) => {
          const cmpStr = { [LT]: "LT", [GT]: "GT" }[<number>cmp];
          const passStr = pass ? "pass" : "fail";
          it(`Should ${passStr} the trigger if eth/tst1 trigger is ${cmpStr} ${triggerPrice}`, async () => {
            const { priceTrigger, testOracleEth, otherWallet, testToken1 } = await deployEthtoTst1TriggerFixture();
            const trigger: TriggerStruct = {
              createTimeParams: ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint8", "uint256"],
                [testToken1.address, ETH_ADDRESS, cmp, triggerPrice]
              ),
              triggerType: PRICE_TRIGGER_TYPE,
              // this is the address of the ITrigger, PriceTrigger.address in this case
              // but we dont expect it to matter within PriceTrigger.
              callee: ETH_ADDRESS,
            };

            const expectedReturn: TriggerReturnStruct = {
              triggerType: PRICE_TRIGGER_TYPE,
              runtimeData: ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [testToken1.address, ETH_ADDRESS, TST1_PRICE_IN_ETH]
              ),
            };
            expectEthersObjDeepEqual(
              [
                pass,
                {
                  triggerType: PRICE_TRIGGER_TYPE,
                  runtimeData: ethers.utils.defaultAbiCoder.encode(
                    ["address", "address", "uint256"],
                    [testToken1.address, ETH_ADDRESS, TST1_PRICE_IN_ETH]
                  ),
                },
              ],
              await priceTrigger.connect(otherWallet).check(trigger)
            );
          });
        });
      }
    );
  });
});
