import { ethers, getNamedAccounts, config, deployments } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber, utils, ContractReceipt, ContractTransaction } from "ethers";
import { ERC20_DECIMALS, ETH_TOKEN, TOKEN_TYPE } from "../../Constants";
import { setupEnvForUniTests } from "../forkFixtures";
import { makeTrueTrigger } from "../../Fixtures";
import {
  createUniBurnAction,
  createUniMintLPAction,
  createUniSwapAction,
  getTokenOutPerTokenInUniSwap
} from "./uniUtils";
import { encodeMinBPerA } from "../sushiswap/sushiUtils";
import { getArgsFromEvent, getFees, isForked, multiplyNumberWithBigNumber } from "../../helper";
import { expect } from "chai";

// NOTE: applicable fees have to be found from uniswap v3 sdk / subgraph.
const DEFAULT_FEE = 3000; // corresponds to 0.03%
const DEFAULT_SLIPPAGE = 0.97;
const NUM_ETH = 1;

describe("Uniswap", () => {
  before(function() {
    if (!isForked()) {
      this.skip();
    }
  });

  // setup
  const testPreReqs = deployments.createFixture(async hre => {
    await deployments.fixture(["BarrenWuffet"]);
    return await setupEnvForUniTests(hre);
  });

  describe("swap", () => {
    it("Should sell NUM_ETH ETH for DAI and then swap back for almost all the ETH", async () => {
      const { protocolAddresses, DAI_TOKEN, McFund, swapUniAction, dai_contract } = await testPreReqs();

      const daiPerETHBN = await getTokenOutPerTokenInUniSwap(
        protocolAddresses.uniswap.quoter,
        ETH_TOKEN,
        DAI_TOKEN,
        DEFAULT_FEE,
        protocolAddresses.tokens.WETH
      );

      const daiPerETH = parseFloat(ethers.utils.formatUnits(daiPerETHBN, 18));

      let collaterals = [ethers.utils.parseEther(NUM_ETH.toString())];
      await expect(
        McFund.takeAction(
          await makeTrueTrigger(),
          createUniSwapAction(
            swapUniAction.address,
            ETH_TOKEN,
            DAI_TOKEN,
            DEFAULT_FEE,
            await encodeMinBPerA(ETH_TOKEN, DAI_TOKEN, daiPerETH * DEFAULT_SLIPPAGE)
          ),
          collaterals,
          await getFees(McFund, collaterals)
        )
      ).to.changeEtherBalance(McFund.address, ethers.utils.parseEther(`-${NUM_ETH}`));

      expect(
        (await dai_contract.balanceOf(McFund.address)) >=
          ethers.utils.parseUnits(String(daiPerETH * DEFAULT_SLIPPAGE), 18)
      );

      // swap DAI back to ETH
      const dai_balance = await dai_contract.balanceOf(McFund.address);
      const prev_eth_balance = await ethers.provider.getBalance(McFund.address);

      collaterals = [await dai_contract.balanceOf(McFund.address)];
      await expect(
        McFund.takeAction(
          await makeTrueTrigger(),
          createUniSwapAction(
            swapUniAction.address,
            DAI_TOKEN,
            ETH_TOKEN,
            DEFAULT_FEE,
            await encodeMinBPerA(DAI_TOKEN, ETH_TOKEN, (1.0 / daiPerETH) * DEFAULT_SLIPPAGE)
          ),
          collaterals,
          await getFees(McFund, collaterals)
        )
      ).to.changeTokenBalance(dai_contract, McFund.address, dai_balance.mul(-NUM_ETH));

      expect(
        (await ethers.provider.getBalance(McFund.address)).sub(prev_eth_balance) >
          multiplyNumberWithBigNumber(DEFAULT_SLIPPAGE / daiPerETH, dai_balance)
      );
    });
  });

  describe("lp", () => {
    it("Should LP 1 ETH and DAI and then remove the LP assets back", async () => {
      const {
        DAI_TOKEN,
        McFund,
        swapUniAction,
        dai_contract,
        mintLPAction,
        protocolAddresses,
        McFundRoboCop
      } = await testPreReqs();

      const daiPerETHBN = await getTokenOutPerTokenInUniSwap(
        protocolAddresses.uniswap.quoter,
        ETH_TOKEN,
        DAI_TOKEN,
        DEFAULT_FEE,
        protocolAddresses.tokens.WETH
      );

      const daiPerETH = parseFloat(ethers.utils.formatUnits(daiPerETHBN, 18));

      // get some DAI first
      let collaterals = [ethers.utils.parseEther(NUM_ETH.toString())];
      await McFund.takeAction(
        await makeTrueTrigger(),
        createUniSwapAction(
          swapUniAction.address,
          ETH_TOKEN,
          DAI_TOKEN,
          DEFAULT_FEE,
          await encodeMinBPerA(ETH_TOKEN, DAI_TOKEN, daiPerETH * DEFAULT_SLIPPAGE)
        ),
        collaterals,
        await getFees(McFund, collaterals)
      );

      let initial_balance_dai = await dai_contract.balanceOf(McFund.address);
      let initial_balance_eth = await ethers.provider.getBalance(McFund.address);
      collaterals = [ethers.utils.parseEther(NUM_ETH.toString()), initial_balance_dai];

      // LP in
      // NOTE: in prod, you'll get this burnActionData from the graph :: position related to ruleHash for the AddLP
      const burnActionAsData = (
        await getArgsFromEvent(
          McFund.takeAction(
            await makeTrueTrigger(),
            await createUniMintLPAction(
              mintLPAction,
              protocolAddresses.uniswap.factory,
              ETH_TOKEN,
              DAI_TOKEN,
              protocolAddresses.tokens.WETH,
              DEFAULT_FEE,
              await encodeMinBPerA(ETH_TOKEN, DAI_TOKEN, daiPerETH * DEFAULT_SLIPPAGE),
              await encodeMinBPerA(DAI_TOKEN, ETH_TOKEN, (1.0 / daiPerETH) * DEFAULT_SLIPPAGE)
            ),
            collaterals,
            await getFees(McFund, collaterals)
          ),
          "PositionCreated",
          McFundRoboCop
        )
      )?.nextActions[0];

      const burnAction = createUniBurnAction(burnActionAsData);
      const nft_id = burnAction[2][0][2];

      const mid_balance_eth = await ethers.provider.getBalance(McFund.address);
      const mid_balance_dai = await dai_contract.balanceOf(McFund.address);

      expect(initial_balance_eth.sub(mid_balance_eth) >= ethers.utils.parseEther(String(daiPerETH * DEFAULT_SLIPPAGE)));
      expect(
        initial_balance_dai.sub(mid_balance_dai) >= multiplyNumberWithBigNumber(DEFAULT_SLIPPAGE, initial_balance_dai)
      );
      // TODO: check if you have the NFT

      await McFund.takeAction(await makeTrueTrigger(), burnAction, [nft_id], [0]);

      expect(
        (await ethers.provider.getBalance(McFund.address)).sub(mid_balance_eth) >=
          multiplyNumberWithBigNumber(DEFAULT_SLIPPAGE, collaterals[0])
      );
      expect(
        (await dai_contract.balanceOf(McFund.address)).sub(mid_balance_dai) >=
          multiplyNumberWithBigNumber(DEFAULT_SLIPPAGE, collaterals[1])
      );
      // TODO: check NFT is gone
    });

    // TODO: increaseLiquidity
    // TODO: decreaseLiquidity
    // TODO: swap some large sums so that range gets fees
    // TODO: collect fees
  });
});
