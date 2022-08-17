import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TriggerStruct, ActionStruct } from '../typechain-types/contracts/rules/RuleExecutor';
import { assert } from "console";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { int } from "hardhat/internal/core/params/argumentTypes";
import { Contract, Bytes, BigNumber } from "ethers";
import { EtherscanProvider } from "@ethersproject/providers";

const ETH_PRICE_IN_USD = 1300 * 10**8;
const UNI_PRICE_IN_USD = 3 * 10**8;
const ERC20_DECIMALS = BigNumber.from(10).pow(18); 

describe("FundManager", () => {
    async function deployFundManagetFixture() {
        const [ownerWallet, ruleMakerWallet, ruleSubscriberWallet, otherWallet1] = await ethers.getSigners();

        const WhitelistService = await ethers.getContractFactory("WhitelistService");
        const whitelistService = await WhitelistService.deploy();
        await whitelistService.createWhitelist("triggers");
        const trigWlHash = await whitelistService.getWhitelistHash(ownerWallet.address, "triggers");
        await whitelistService.createWhitelist("actions");
        const actWlHash = await whitelistService.getWhitelistHash(ownerWallet.address, "actions");

        const RuleExecutor = await ethers.getContractFactory("RuleExecutor");
        const ruleExecutor = await RuleExecutor.deploy(whitelistService.address, trigWlHash, actWlHash);

        const FundManager = await ethers.getContractFactory("FundManager");
        const fundManager = await FundManager.deploy();

        const TestSwapRouter = await ethers.getContractFactory("TestSwapRouter");
        const testSwapRouter = await TestSwapRouter.deploy();

        const TestToken = await ethers.getContractFactory("TestToken");
        const testToken1 = await TestToken.deploy(BigNumber.from("1000000").mul(ERC20_DECIMALS), "Test1", "TST1");
        const testToken2 = await TestToken.deploy(BigNumber.from("1000000").mul(ERC20_DECIMALS), "Test2", "TST2");
        const WETH = await TestToken.deploy(BigNumber.from("1000000").mul(ERC20_DECIMALS), "WETH", "WETH");

        const SwapUniSingleAction = await ethers.getContractFactory("SwapUniSingleAction");

        const swapUniSingleAction = await SwapUniSingleAction.deploy(
            testSwapRouter.address, WETH.address);

        const TestOracle = await ethers.getContractFactory("TestOracle");
        const testOracleEth = await TestOracle.deploy(ETH_PRICE_IN_USD);
        const testOracleUni = await TestOracle.deploy(UNI_PRICE_IN_USD);

        const PriceTrigger = await ethers.getContractFactory("PriceTrigger");
        const priceTrigger = await PriceTrigger.deploy();
        await priceTrigger.addPriceFeed("eth", testOracleEth.address);
        await priceTrigger.addPriceFeed("uni", testOracleUni.address);

        return {
            ruleExecutor, fundManager, priceTrigger, swapUniSingleAction, testOracleEth, testOracleUni,
            testToken1, testToken2, ownerWallet, ruleMakerWallet, ruleSubscriberWallet, otherWallet1, whitelistService, trigWlHash, actWlHash
        };
    }


    describe("Deployment", () => {

        it("Should set the right owner", async function () {
            const { fundManager, ownerWallet } = await loadFixture(deployFundManagetFixture);

            expect(await fundManager.owner()).to.equal(ownerWallet.address);
        });
    });

    describe.skip("Create fund", () => {

    });

    describe.skip("Open and close positions", () => {

    });

    describe.skip("Deposit", () => {

    });

    describe.skip("Withdraw", () => {

    });

    describe.skip("Take Action", () => {

    });

    describe.skip("Status changes", () => {

    });

    describe("User Stories", () => {
        it("allows creating a fund with profit, lockin and min size", async () => {
            /**
             * Opens call for USD$300,000 fund. 
             * 30 Days to fill or 300K, whichever comes first.
             * Minimum cheque size of $30,000. 
             * 2% of final fund size is profit. 
             * Minimum 6 months lock, ie LPs cannot withdraw money before.
             */
        });

        it("allows fund manager to create a TWAP swap trade", async () => {
            /*
             TWAP 10ETH every 5 mins every 1 hour to USDC. If price drops below 1200USD/ eth, stop swaps. 
             If the price goes back up, continue.
             We can do this by create time delay triggers every 5 mins.
            */
        })
        it("allows fund manager to create a short twap trade", async () => {
            /**
             * Fund manager opens a short on Cap finance by depositing ETH. 
             * Trigger price is 1500 USD. 120 eth worth of short. 
             * Twap in 1 hr. every 5 mins, sell 10ETH if price is within -/+5% range of 1500USD 
             * Stop loss at 1600USD. TWAP out eth every 30sec. 
             * Buy eth at 1000USd. TWAP every 5mins, in 30mins. Price range doesnt matter.
             */
        })

        it("allows investing in dopex", () => {
            /**
             * Deposit 1000USDC into Dopex ETH short contracts
             * Buy 1 eth 1kUSD call at 10USD. 
             * Collect interest rate until contract expires.* 
             */
        })
    });
});
