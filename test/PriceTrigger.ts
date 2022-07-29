import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { RETypes } from '../typechain-types/contracts/PriceTrigger';


const GT = 0;
const LT = 1;
const ETH_PRICE = 100;
const UNI_PRICE = 10;
const ETH_UNI_PARAM = ethers.utils.defaultAbiCoder.encode([ "string", "string" ], [ "eth", "uni" ]);
const ETH_UNI_PRICE = (ETH_PRICE/ UNI_PRICE);

describe("PriceTrigger", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployPriceTriggerFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const PriceTrigger = await ethers.getContractFactory("PriceTrigger");
    const priceTrigger = await PriceTrigger.deploy();

    const TestOracle = await ethers.getContractFactory("TestOracle");
    const testOracleEth = await TestOracle.deploy(ETH_PRICE);
    const testOracleUni = await TestOracle.deploy(UNI_PRICE);
    return { priceTrigger, testOracleEth, testOracleUni, owner, otherAccount };
  }

  async function deployEthUniTriggerFixture() {
    const { priceTrigger, testOracleEth, testOracleUni, otherAccount } = await loadFixture(
      deployPriceTriggerFixture
    );
    await priceTrigger.addPriceFeed("eth", testOracleEth.address);
    await priceTrigger.addPriceFeed("uni", testOracleUni.address);
    
    return { priceTrigger, testOracleEth, testOracleUni, otherAccount };
  }

  describe("Deployment", () => {    

    it("Should set the right owner", async function () {
      const { priceTrigger, owner } = await loadFixture(deployPriceTriggerFixture);

      expect(await priceTrigger.owner()).to.equal(owner.address);
    });
  });

  describe("Add Triggers", () => {
    it("Should revert with the right error if called from another account", async () => {
      const { priceTrigger, owner, otherAccount } = await loadFixture(
        deployPriceTriggerFixture
      );

      // We use lock.connect() to send a transaction from another account
      await expect(priceTrigger.connect(otherAccount).addPriceFeed("eth", "0xc0ffee254729296a45a3885639AC7E10F9d54979")).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Should add a trigger feed if called by the owner", async () => {
      const { priceTrigger, owner } = await loadFixture(
        deployPriceTriggerFixture
      );
      
      await priceTrigger.addPriceFeed("eth", "0xc0ffee254729296a45a3885639AC7E10F9d54979");
    });
  });


  describe("Validate Trigger", () => {    
    it("Should revert if the trigger has only 1 asset", async () => {
      const { priceTrigger, testOracleEth, otherAccount } = await loadFixture(
        deployEthUniTriggerFixture
      );

      const trigger: RETypes.TriggerStruct = {        
        op: GT,
        param: ethers.utils.defaultAbiCoder.encode([ "string" ], [ "eth" ]),        
        // this is the address of the ITrigger, PriceTrigger.address in this case
        // but we dont expect it to matter within PriceTrigger.
        callee: ethers.constants.AddressZero,
        value: 0
      };
      
      await expect(priceTrigger.connect(otherAccount).validateTrigger(trigger)).to.be.revertedWithoutReason;;
    });
    
    it("Should revert if the trigger has 2 assets and the datasource is specified incorrectly", async () => {
      const { priceTrigger, otherAccount } = await loadFixture(
        deployEthUniTriggerFixture
      );

      const trigger: RETypes.TriggerStruct = {        
        op: GT,
        param: ethers.utils.defaultAbiCoder.encode([ "string", "string" ], [ "eth", "sushi" ]),
        callee: ethers.constants.AddressZero,
        value: 0
      };
            
      await expect(priceTrigger.connect(otherAccount).validateTrigger(trigger)).to.be.revertedWithoutReason;

    });

    it("Should pass if the trigger has 2 assets and the datasource is specified", async () => {
      const { priceTrigger, testOracleEth, otherAccount } = await loadFixture(
        deployEthUniTriggerFixture
      );

      const trigger: RETypes.TriggerStruct = {        
        op: GT,        
        param: ETH_UNI_PARAM,
        callee: ethers.constants.AddressZero,
        value: 0
      };

      expect(await priceTrigger.connect(otherAccount).validateTrigger(trigger)).to.equal(true);
      
    });
  });
  describe("Check Trigger", () => {        
    describe("Should pass / fail the trigger based on eth/uni limit price. Current eth/uni is " + ETH_UNI_PRICE, () => {      
      it("Should fail the trigger if eth/uni trigger is LT " + (ETH_UNI_PRICE - 1), async () => {
        const { priceTrigger, testOracleEth, otherAccount } = await loadFixture(
          deployEthUniTriggerFixture
        );
        const trigger: RETypes.TriggerStruct = {        
          op: LT,          
          param: ETH_UNI_PARAM,
          callee: ethers.constants.AddressZero,
          value: (ETH_UNI_PRICE - 1)
        };
        
        expect(await priceTrigger.connect(otherAccount).checkTrigger(trigger)).to.deep.equal([false, ethers.BigNumber.from(ETH_UNI_PRICE)]);
      });
  
      it("Should fail the trigger if eth/uni limit is GT " + (ETH_UNI_PRICE + 1), async () => {
        const { priceTrigger, testOracleEth, otherAccount } = await loadFixture(
          deployEthUniTriggerFixture
        );
        const trigger: RETypes.TriggerStruct = {        
          op: GT,          
          param: ETH_UNI_PARAM,
          callee: ethers.constants.AddressZero,
          value: (ETH_UNI_PRICE + 1)
        };
                    
        expect(await priceTrigger.connect(otherAccount).checkTrigger(trigger)).to.deep.equal([false, ethers.BigNumber.from(ETH_UNI_PRICE)]);
  
      });
  
      it("Should pass the trigger if eth/uni limit is GT " + (ETH_UNI_PRICE - 1), async () => {
        const { priceTrigger, testOracleEth, otherAccount } = await loadFixture(
          deployEthUniTriggerFixture
        );
        const trigger: RETypes.TriggerStruct = {        
          op: GT,          
          param: ETH_UNI_PARAM,
          callee: ethers.constants.AddressZero,
          value: (ETH_UNI_PRICE - 1)
        };
                    
        expect(await priceTrigger.connect(otherAccount).checkTrigger(trigger)).to.deep.equal([true, ethers.BigNumber.from(ETH_UNI_PRICE)]);
  
      });
  
      it("Should pass the trigger if eth/uni limit is LT " + (ETH_UNI_PRICE + 1), async () => {
        const { priceTrigger, testOracleEth, otherAccount } = await loadFixture(
          deployEthUniTriggerFixture
        );
        const trigger: RETypes.TriggerStruct = {        
          op: LT,          
          param: ETH_UNI_PARAM,
          callee: ethers.constants.AddressZero,
          value: (ETH_UNI_PRICE + 1)
        };
                    
        expect(await priceTrigger.connect(otherAccount).checkTrigger(trigger)).to.deep.equal([true, ethers.BigNumber.from(ETH_UNI_PRICE)]);
  
      });

    })
        
  })
});
