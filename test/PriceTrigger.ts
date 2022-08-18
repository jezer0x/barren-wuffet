import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployPriceTriggerFixture, deployEthUniTriggerFixture } from "./Fixtures"; 
import { TriggerStruct } from '../typechain-types/contracts/rules/RuleExecutor';
import { GT, LT, UNI_PRICE_IN_ETH_PARAM, UNI_PRICE_IN_ETH } from "./Constants"

describe("PriceTrigger", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.

  describe("Deployment", () => {

    it("Should set the right ownerWallet", async function () {
      const { priceTrigger, ownerWallet } = await loadFixture(deployPriceTriggerFixture);
      expect(await priceTrigger.owner()).to.equal(ownerWallet.address);
    });
  });

  describe("Add Triggers", () => {
    it("Should revert with the right error if called from another account", async () => {
      const [_, otherWallet] = await ethers.getSigners(); // TODO: better way to do this?

      const { priceTrigger } = await loadFixture(
        deployPriceTriggerFixture
      );

      // We use lock.connect() to send a transaction from another account
      await expect(priceTrigger.connect(otherWallet).addPriceFeed("eth", "0xc0ffee254729296a45a3885639AC7E10F9d54979")).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Should add a trigger feed if called by the ownerWallet", async () => {
      const { priceTrigger, ownerWallet } = await loadFixture(
        deployPriceTriggerFixture
      );

      await priceTrigger.addPriceFeed("eth", "0xc0ffee254729296a45a3885639AC7E10F9d54979");
    });
  });


  describe("Validate Trigger", () => {
    it("Should revert if the trigger has only 1 asset", async () => {
      const { priceTrigger, otherWallet } = await loadFixture(
        deployEthUniTriggerFixture
      );

      const trigger: TriggerStruct = {
        op: GT,
        param: ethers.utils.defaultAbiCoder.encode(["string"], ["eth"]),
        // this is the address of the ITrigger, PriceTrigger.address in this case
        // but we dont expect it to matter within PriceTrigger.
        callee: ethers.constants.AddressZero,
        value: 0
      };

      await expect(priceTrigger.connect(otherWallet).validate(trigger)).to.be.revertedWithoutReason;;
    });

    it("Should revert if the trigger has 2 assets and the datasource is specified incorrectly", async () => {
      const { priceTrigger, otherWallet } = await loadFixture(
        deployEthUniTriggerFixture
      );

      const trigger: TriggerStruct = {
        op: GT,
        param: ethers.utils.defaultAbiCoder.encode(["string", "string"], ["eth", "sushi"]),
        callee: ethers.constants.AddressZero,
        value: 0
      };

      await expect(priceTrigger.connect(otherWallet).validate(trigger)).to.be.revertedWithoutReason;

    });

    it("Should pass if the trigger has 2 assets and the datasource is specified", async () => {
      const { priceTrigger, otherWallet } = await loadFixture(
        deployEthUniTriggerFixture
      );

      const trigger: TriggerStruct = {
        op: GT,
        param: UNI_PRICE_IN_ETH_PARAM,
        callee: ethers.constants.AddressZero,
        value: 0
      };

      expect(await priceTrigger.connect(otherWallet).validate(trigger)).to.equal(true);

    });
  });
  describe("Check Trigger", () => {
    describe("Should pass / fail the trigger based on eth/uni limit price. Current eth/uni is " + UNI_PRICE_IN_ETH, () => {
      it("Should fail the trigger if eth/uni trigger is LT " + (UNI_PRICE_IN_ETH.sub(1)), async () => {
        const { priceTrigger, testOracleEth, otherWallet } = await loadFixture(
          deployEthUniTriggerFixture
        );
        const trigger: TriggerStruct = {
          op: LT,
          param: UNI_PRICE_IN_ETH_PARAM,
          callee: ethers.constants.AddressZero,
          value: UNI_PRICE_IN_ETH.sub(1)
        };
        expect(await priceTrigger.connect(otherWallet).check(trigger)).to.deep.equal([false, UNI_PRICE_IN_ETH]);
      });

      it("Should fail the trigger if eth/uni limit is GT " + (UNI_PRICE_IN_ETH.add(1)), async () => {
        const { priceTrigger, testOracleEth, otherWallet } = await loadFixture(
          deployEthUniTriggerFixture
        );
        const trigger: TriggerStruct = {
          op: GT,
          param: UNI_PRICE_IN_ETH_PARAM,
          callee: ethers.constants.AddressZero,
          value: (UNI_PRICE_IN_ETH.add(1))
        };

        expect(await priceTrigger.connect(otherWallet).check(trigger)).to.deep.equal([false, UNI_PRICE_IN_ETH]);

      });

      it("Should pass the trigger if eth/uni limit is GT " + (UNI_PRICE_IN_ETH.sub(1)), async () => {
        const { priceTrigger, testOracleEth, otherWallet } = await loadFixture(
          deployEthUniTriggerFixture
        );
        const trigger: TriggerStruct = {
          op: GT,
          param: UNI_PRICE_IN_ETH_PARAM,
          callee: ethers.constants.AddressZero,
          value: (UNI_PRICE_IN_ETH.sub(1))
        };

        expect(await priceTrigger.connect(otherWallet).check(trigger)).to.deep.equal([true, UNI_PRICE_IN_ETH]);

      });

      it("Should pass the trigger if eth/uni limit is LT " + (UNI_PRICE_IN_ETH.add(1)), async () => {
        const { priceTrigger, testOracleEth, otherWallet } = await loadFixture(
          deployEthUniTriggerFixture
        );
        const trigger: TriggerStruct = {
          op: LT,
          param: UNI_PRICE_IN_ETH_PARAM,
          callee: ethers.constants.AddressZero,
          value: (UNI_PRICE_IN_ETH.add(1))
        };

        expect(await priceTrigger.connect(otherWallet).check(trigger)).to.deep.equal([true, UNI_PRICE_IN_ETH]);

      });

    })

  })
});
