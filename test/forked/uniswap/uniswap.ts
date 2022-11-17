import { ethers, getNamedAccounts, config, deployments } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber, utils, ContractReceipt, ContractTransaction } from "ethers";
import { ERC20_DECIMALS, ETH_TOKEN, TOKEN_TYPE } from "../../Constants";
import { setupEnvForUniTests } from "../forkFixtures";
import { makeTrueTrigger } from "../../Fixtures";
import { createUniMintLPAction, createUniSwapAction, getTokenOutPerTokenInUniSwap } from "./uniUtils";
import { encodeMinBPerA } from "../sushiswap/sushiUtils";
import { getFees, isForked, multiplyNumberWithBigNumber } from "../../helper";
import { expect } from "chai";

// NOTE: applicable fees have to be found from uniswap v3 sdk / subgraph.
const DEFAULT_FEE = 3000; // corresponds to 0.03%
const DEFAULT_SLIPPAGE = 0;
const NUM_ETH = 1;

describe("Uniswap", () => {
  // run these only when forking
  if (isForked()) {
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

        let balance_dai = await dai_contract.balanceOf(McFund.address);

        collaterals = [ethers.utils.parseEther(NUM_ETH.toString()), balance_dai];

        console.log(ethers.utils.formatUnits(await dai_contract.balanceOf(McFund.address), 18));
        console.log(ethers.utils.formatEther(await ethers.provider.getBalance(McFund.address)));
        console.log("---");
        const tx: ContractTransaction = await McFund.takeAction(
          await makeTrueTrigger(),
          await createUniMintLPAction(
            mintLPAction,
            protocolAddresses.uniswap.factory,
            ETH_TOKEN,
            DAI_TOKEN,
            protocolAddresses.tokens.WETH,
            500,
            await encodeMinBPerA(ETH_TOKEN, DAI_TOKEN, daiPerETH * DEFAULT_SLIPPAGE),
            await encodeMinBPerA(DAI_TOKEN, ETH_TOKEN, (1.0 / daiPerETH) * DEFAULT_SLIPPAGE)
          ),
          collaterals,
          await getFees(McFund, collaterals)
        );

        console.log(ethers.utils.formatUnits(await dai_contract.balanceOf(McFund.address), 18));
        console.log(ethers.utils.formatEther(await ethers.provider.getBalance(McFund.address)));
        const burnActionAsData = (await tx.wait()).events.find(
          //@ts-ignore
          (x: { event: string }) => x.event === "PositionCreated"
        ).args.nextActions[0];

        const burnAction = ethers.utils.defaultAbiCoder.decode(
          ["(address,bytes,(uint8,address,uint256)[],(uint8,address,uint256)[])"], // signature of an Action struct
          burnActionAsData
        )[0];

        const nft_id = burnAction[2][0][2];

        // TODO: increaseLiquidity
        // TODO: decreaseLiquidity
        // TODO: swap some large sums so that range gets fees
        // TODO: collect fees

        // A long time has passed; people can now force close the position since lockin period has passed
        await time.increaseTo((await time.latest()) + 86400 * 10);

        await McFund.takeActionToClosePosition(await makeTrueTrigger(), burnAction, [nft_id], [0]);

        // TODO: check that collateral was received

        // Fund can be closed now
        await McFund.closeFund();
      });
    });
  }
});
