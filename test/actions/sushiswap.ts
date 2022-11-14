import { expect } from "chai";
import { makeTrueTrigger } from "../Fixtures";
import { ETH_TOKEN, TOKEN_TYPE } from "../Constants";
import { config, ethers, getNamedAccounts, deployments } from "hardhat";
import { Contract, BigNumber } from "ethers";
import {
  IERC20Metadata__factory,
  IUniswapV2Factory__factory,
  IUniswapV2Router02__factory
} from "../../typechain-types";
import { createSushiSwapAction, calculateMinOutPerInForSwap, getTokenOutPerTokenIn } from "./sushiUtils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { setupEnvForActionTests } from "./forkFixtures";

async function setupEnvForSushiTests({ ethers }: HardhatRuntimeEnvironment) {
  const sushiSwapExactXForY = await ethers.getContract("SushiSwapExactXForY");
  const sushiAddLiquidity = await ethers.getContract("SushiAddLiquidity");
  const { protocolAddresses, DAI_TOKEN, dai_contract, McFund } = await setupEnvForActionTests(ethers);
  return {
    sushiSwapExactXForY,
    sushiAddLiquidity,
    protocolAddresses,
    DAI_TOKEN,
    dai_contract,
    McFund
  };
}

describe("Sushiswap", () => {
  // run these only when forking
  if (config.networks.hardhat.forking?.enabled) {
    // setup
    const testPreReqs = deployments.createFixture(async hre => {
      await deployments.fixture(["BarrenWuffet"]);
      return await setupEnvForSushiTests(hre);
    });

    describe("swap", () => {
      it("Should sell 2 ETH for DAI", async () => {
        const { protocolAddresses, DAI_TOKEN, McFund, sushiSwapExactXForY, dai_contract } = await testPreReqs();

        const daiPerETH = parseFloat(
          ethers.utils.formatUnits(
            await getTokenOutPerTokenIn(
              protocolAddresses.sushiswap.swap_router,
              ETH_TOKEN,
              DAI_TOKEN,
              protocolAddresses.tokens.WETH
            ),
            18
          )
        );

        await expect(
          McFund.takeAction(
            await makeTrueTrigger(),
            createSushiSwapAction(
              sushiSwapExactXForY.address,
              ETH_TOKEN,
              DAI_TOKEN,
              await calculateMinOutPerInForSwap(ETH_TOKEN, DAI_TOKEN, daiPerETH * 0.97), // some slippage tolerance
              protocolAddresses.tokens.WETH
            ),
            [ethers.utils.parseEther(String(2))],
            [BigNumber.from(0)] // 0 fees set in deploy
          )
        ).to.changeEtherBalance(McFund.address, ethers.utils.parseEther("-2"));

        expect(
          (await dai_contract.balanceOf(McFund.address)) >= ethers.utils.parseUnits(String(daiPerETH * 2 * 0.97), 18)
        );
      });

      it("Should sell DAI balance for almost all ETH back", async () => {
        const { protocolAddresses, DAI_TOKEN, McFund, sushiSwapExactXForY, dai_contract } = await testPreReqs();

        // Get some DAI first
        const daiPerETH = parseFloat(
          ethers.utils.formatUnits(
            await getTokenOutPerTokenIn(
              protocolAddresses.sushiswap.swap_router,
              ETH_TOKEN,
              DAI_TOKEN,
              protocolAddresses.tokens.WETH
            ),
            18
          )
        );

        await McFund.takeAction(
          await makeTrueTrigger(),
          createSushiSwapAction(
            sushiSwapExactXForY.address,
            ETH_TOKEN,
            DAI_TOKEN,
            await calculateMinOutPerInForSwap(ETH_TOKEN, DAI_TOKEN, daiPerETH * 0.97), // some slippage tolerance
            protocolAddresses.tokens.WETH
          ),
          [ethers.utils.parseEther(String(2))],
          [BigNumber.from(0)] // 0 fees set in deploy
        );

        // swap DAI back to ETH
        const dai_balance = await dai_contract.balanceOf(McFund.address);
        const prev_eth_balance = await ethers.provider.getBalance(McFund.address);

        await expect(
          McFund.takeAction(
            await makeTrueTrigger(),
            createSushiSwapAction(
              sushiSwapExactXForY.address,
              DAI_TOKEN,
              ETH_TOKEN,
              await calculateMinOutPerInForSwap(DAI_TOKEN, ETH_TOKEN, (1.0 / daiPerETH) * 0.97),
              protocolAddresses.tokens.WETH
            ),
            [dai_balance],
            [BigNumber.from(0)] // 0 fees set in deploy
          )
        ).to.changeTokenBalance(dai_contract, McFund.address, dai_balance.mul(-1));

        expect(
          (await ethers.provider.getBalance(McFund.address)).sub(prev_eth_balance) >
            ethers.utils.parseUnits(String((dai_balance * 0.97) / daiPerETH), 18)
        );
      });

      it("Should revert if wrong path is given", async () => {
        const { protocolAddresses, DAI_TOKEN, McFund, sushiSwapExactXForY } = await testPreReqs();
        await expect(
          McFund.takeAction(
            await makeTrueTrigger(),
            {
              callee: sushiSwapExactXForY.address,
              data: ethers.utils.defaultAbiCoder.encode(
                ["address[]", "uint256"],
                [[protocolAddresses.tokens.WETH, protocolAddresses.tokens.WETH], 0]
              ),
              inputTokens: [ETH_TOKEN], // eth
              outputTokens: [DAI_TOKEN] // swapping for DAI
            },
            [ethers.utils.parseEther("1")],
            [BigNumber.from(0)] // 0 fees set in deploy
          )
        ).to.be.reverted;
      });
    });

    describe("add and remove lp", () => {
      it("Should give back LP ERC20 tokens when liquidity is added", async () => {
        const {
          protocolAddresses,
          DAI_TOKEN,
          McFund,
          dai_contract,
          sushiAddLiquidity,
          sushiSwapExactXForY
        } = await testPreReqs();

        // Get some DAI first
        const daiPerETH = parseFloat(
          ethers.utils.formatUnits(
            await getTokenOutPerTokenIn(
              protocolAddresses.sushiswap.swap_router,
              ETH_TOKEN,
              DAI_TOKEN,
              protocolAddresses.tokens.WETH
            ),
            18
          )
        );

        await McFund.takeAction(
          await makeTrueTrigger(),
          createSushiSwapAction(
            sushiSwapExactXForY.address,
            ETH_TOKEN,
            DAI_TOKEN,
            await calculateMinOutPerInForSwap(ETH_TOKEN, DAI_TOKEN, daiPerETH * 0.97), // some slippage tolerance
            protocolAddresses.tokens.WETH
          ),
          [ethers.utils.parseEther(String(2))],
          [BigNumber.from(0)] // 0 fees set in deploy
        );

        const sushiSwapRouter = new Contract(
          protocolAddresses.sushiswap.swap_router,
          IUniswapV2Router02__factory.abi,
          ethers.provider
        );

        const sushiSwapFactory = new Contract(
          await sushiSwapRouter.factory(),
          IUniswapV2Factory__factory.abi,
          ethers.provider
        );

        const dai_weth_slp_addr = await sushiSwapFactory.getPair(protocolAddresses.tokens.WETH, DAI_TOKEN.addr);

        const DAI_WETH_SLP_TOKEN = {
          t: TOKEN_TYPE.ERC20,
          addr: dai_weth_slp_addr,
          id: BigNumber.from(0)
        };
        const balance_dai = await dai_contract.balanceOf(McFund.address);

        await expect(
          McFund.takeAction(
            await makeTrueTrigger(),
            {
              callee: sushiAddLiquidity.address,
              data: "0x",
              inputTokens: [DAI_TOKEN, ETH_TOKEN],
              outputTokens: [DAI_TOKEN, ETH_TOKEN, DAI_WETH_SLP_TOKEN]
            },
            [balance_dai, ethers.utils.parseEther("2")],
            [BigNumber.from(0), BigNumber.from(0)] // 0 fees set in deploy
          )
        ) // TODO: following 2 lines might fail because not all of both tokens used up in LP, need some tolerance
          .to.changeEtherBalance(McFund.address, ethers.utils.parseEther(String(-2)))
          .to.changeTokenBalance(dai_contract, McFund.address, balance_dai.mul(-1));

        expect(
          (await new Contract(dai_weth_slp_addr, IERC20Metadata__factory.abi, ethers.provider).balanceOf(
            McFund.address
          )) > 0
        );
      });
    });
  }
});
