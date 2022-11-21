import { ethers, config, deployments } from "hardhat";
import { expect } from "chai";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber } from "ethers";
import { ERC20_DECIMALS, ETH_TOKEN, ETH_ADDRESS } from "../../Constants";
import { getHashFromEvent, isForked } from "../../helper";
import { IOps__factory } from "../../../typechain-types";
import { makeTrueTrigger } from "../../Fixtures";
import { encodeMinBPerA, createSushiSwapAction, getTokenOutPerTokenInSushiSwap } from "../sushiswap/sushiUtils";
import { setupEnvForSushiTests } from "../forkFixtures";

describe("Gelato Bot", () => {
  before(function() {
    if (!isForked()) {
      this.skip();
    }
  });

  // setup
  const testPreReqs = deployments.createFixture(async hre => {
    await deployments.fixture(["BarrenWuffet"]);
    return await setupEnvForSushiTests(hre);
  });

  describe("Bot Snipe", () => {
    it("Should execute rule if bot is funded and rule is executable", async () => {
      const {
        protocolAddresses,
        DAI_TOKEN,
        McFund,
        sushiSwapExactXForY,
        dai_contract,
        McFundRoboCop
      } = await testPreReqs();

      const daiPerETH = parseFloat(
        ethers.utils.formatUnits(
          await getTokenOutPerTokenInSushiSwap(
            protocolAddresses.sushiswap.swap_router,
            ETH_TOKEN,
            DAI_TOKEN,
            protocolAddresses.tokens.WETH
          ),
          18
        )
      );

      // Case 1: Sell ETH for DAI
      const ruleHash = await getHashFromEvent(
        McFund.createRule(
          [await makeTrueTrigger()],
          [
            createSushiSwapAction(
              sushiSwapExactXForY.address,
              ETH_TOKEN,
              DAI_TOKEN,
              await encodeMinBPerA(ETH_TOKEN, DAI_TOKEN, daiPerETH * 0.97),
              protocolAddresses.tokens.WETH
            )
          ],
          false,
          [],
          []
        ),
        "Created",
        McFundRoboCop,
        "ruleHash"
      );

      await McFund.addRuleCollateral(ruleHash, [BigNumber.from(2).mul(ERC20_DECIMALS)], [BigNumber.from(0)]); // 0 fees set in deploy
      await McFund.activateRule(ruleHash);

      // botFrontend must fund the treasury, else bot won't exec
      const botFrontend = await ethers.getContract("BotFrontend");
      await botFrontend.deposit(ethers.utils.parseEther("0.1"), { value: ethers.utils.parseEther("0.1") });

      const [canExec, execData] = await botFrontend.checker(McFundRoboCop.address, ruleHash);

      if (!canExec) {
        throw "Something went wrong! canExec was false";
      }

      const gelatoOps = new Contract(protocolAddresses.gelato.ops, IOps__factory.abi, ethers.provider);

      // impersonate gelato bot and do the bot's work
      const gelatoBotAddr = await gelatoOps.gelato();
      await impersonateAccount(gelatoBotAddr);
      const gelatoBot = await ethers.getSigner(gelatoBotAddr);

      await expect(
        gelatoOps.connect(gelatoBot).exec(
          botFrontend.address,
          botFrontend.address,
          execData,
          {
            modules: [0],
            args: [
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  botFrontend.address,
                  botFrontend.interface.encodeFunctionData("checker(address,bytes32)", [
                    McFundRoboCop.address,
                    ruleHash
                  ])
                ]
              )
            ]
          },
          ethers.utils.parseEther("0.01"),
          ETH_ADDRESS,
          true,
          true
        )
      ).to.not.be.reverted;

      await McFund.redeemRuleOutputs();

      expect(
        (await dai_contract.balanceOf(McFund.address)) >= ethers.utils.parseUnits(String(daiPerETH * 2 * 0.97), 18)
      );
    });
  });
});
