import { expect } from "chai";
import { ethers, getNamedAccounts, config, deployments } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber, utils } from "ethers";
import { ERC20_DECIMALS, ETH_TOKEN, TOKEN_TYPE } from "../../Constants";
import { setupEnvForUniTests } from "../forkFixtures";
import { makeTrueTrigger } from "../../Fixtures";
import { abi as FACTORY_ABI } from "@134dd3v/uniswap-v3-core-0.8-support/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import { abi as POOL_ABI } from "@134dd3v/uniswap-v3-core-0.8-support/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";

describe("Uniswap", () => {
  // run these only when forking
  if (config.networks.hardhat.forking?.enabled) {
    // setup
    const testPreReqs = deployments.createFixture(async hre => {
      await deployments.fixture(["BarrenWuffet"]);
      return await setupEnvForUniTests(hre);
    });

    describe("swap", () => {
      it("Should sell 1 ETH for DAI and then swap back for almost all the ETH", async () => {
        const { DAI_TOKEN, McFund, swapUniAction, dai_contract } = await testPreReqs();

        await McFund.takeAction(
          await makeTrueTrigger(),
          {
            callee: swapUniAction.address,
            data: ethers.utils.defaultAbiCoder.encode(["uint24"], [3000]),
            inputTokens: [ETH_TOKEN],
            outputTokens: [DAI_TOKEN]
          },
          [BigNumber.from(1).mul(ERC20_DECIMALS)],
          [BigNumber.from(0)] // 0 fees set in deploy
        );

        // TODO: What to expect

        await McFund.takeAction(
          await makeTrueTrigger(),
          {
            callee: swapUniAction.address,
            data: ethers.utils.defaultAbiCoder.encode(["uint24"], [3000]),
            inputTokens: [DAI_TOKEN],
            outputTokens: [ETH_TOKEN]
          },
          [await dai_contract.balanceOf(McFund.address)],
          [BigNumber.from(0)] // 0 fees set in deploy
        );

        // TODO: What to expect?
      });
    });

    describe("lp", () => {
      it("Should sell 1 ETH for DAI and then swap back for almost all the ETH", async () => {
        const { DAI_TOKEN, McFund, swapUniAction, dai_contract, mintLPAction } = await testPreReqs();

        // get some DAI first
        await McFund.takeAction(
          await makeTrueTrigger(),
          {
            callee: swapUniAction.address,
            data: ethers.utils.defaultAbiCoder.encode(["uint24"], [3000]),
            inputTokens: [ETH_TOKEN],
            outputTokens: [DAI_TOKEN]
          },
          [BigNumber.from(1).mul(ERC20_DECIMALS)],
          [BigNumber.from(0)] // 0 fees set in deploy
        );

        let balance_dai = await dai_contract.balanceOf(McFund.address);

        let LP_NFT = {
          t: TOKEN_TYPE.ERC721,
          addr: await mintLPAction.nonfungiblePositionManager(),
          id: BigNumber.from(0)
        };

        const poolFactory = new Contract("0x1F98431c8aD98523631AE4a59f267346ea31F984", FACTORY_ABI, ethers.provider);
        const pool = new Contract(
          await poolFactory.getPool(DAI_TOKEN.addr, DAI_TOKEN.addr, 500),
          POOL_ABI,
          ethers.provider
        );

        var S0 = await pool.slot0();
        var CT = parseInt(S0.tick);
        var Tsp = parseInt(await pool.tickSpacing());
        var NHT = Math.floor(CT / Tsp) * Tsp;
        var NLT = Math.floor(CT / Tsp) * Tsp + Tsp;
        if (NLT > NHT) {
          var temp = NLT;
          NLT = NHT;
          NHT = temp;
        }

        console.log(balance_dai.toString(), balance_dai.toString());
        const tx = await McFund.takeAction(
          await makeTrueTrigger(),
          {
            callee: (await ethers.getContract("UniMintLiquidityPosition")).address,
            data: ethers.utils.defaultAbiCoder.encode(
              ["uint24", "int24", "int24"],
              [500, NLT.toString(), NHT.toString()]
            ),
            inputTokens: [DAI_TOKEN, DAI_TOKEN],
            outputTokens: [DAI_TOKEN, DAI_TOKEN, LP_NFT]
          },
          [balance_dai, balance_dai],
          [BigNumber.from(0), BigNumber.from(0)] // 0 fees set in deploy
        );
        const burnActionAsData = (await tx.wait()).events.find(
          //@ts-ignore
          (x: { event: string; address: string }) => x.event === "PositionCreated"
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
