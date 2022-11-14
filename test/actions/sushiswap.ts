import { expect } from "chai";
import { makeDefaultSubConstraints, makeTrueTrigger } from "../Fixtures";
import { ETH_TOKEN, TOKEN_TYPE, DEFAULT_SUB_TO_MAN_FEE_PCT } from "../Constants";
import { getAddressFromEvent } from "../helper";
import { config, ethers, getNamedAccounts, deployments } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber } from "ethers";
import { getProtocolAddresses } from "../../deploy/protocol_addresses";
import {
  IERC20Metadata__factory,
  IUniswapV2Factory__factory,
  IUniswapV2Router02__factory
} from "../../typechain-types";
import { createSushiSwapAction, calculateMinOutPerInForSwap, getTokenOutPerTokenIn } from "./sushi_utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";

async function setupEnvForSushiTests({ ethers }: HardhatRuntimeEnvironment) {
  const protocolAddresses: any = await getProtocolAddresses("31337", true);
  const BW = await ethers.getContract("BarrenWuffet");
  const dai_contract = new Contract(protocolAddresses.tokens.DAI, IERC20Metadata__factory.abi, ethers.provider);
  const DAI_TOKEN = { t: TOKEN_TYPE.ERC20, addr: protocolAddresses.tokens.DAI, id: BigNumber.from(0) };

  const McFundAddr = await getAddressFromEvent(
    BW.createFund("marlieChungerFund", await makeDefaultSubConstraints(), DEFAULT_SUB_TO_MAN_FEE_PCT, []),
    "Created",
    BW.address,
    1
  );

  const McFund: Contract = await ethers.getContractAt("Fund", McFundAddr);
  await McFund.deposit(ETH_TOKEN, ethers.utils.parseEther("21"), {
    value: ethers.utils.parseEther("21")
  });

  // increase to beyond deadline so we can start taking actions
  await time.increaseTo((await time.latest()) + 86400);

  const trueTrigger = await makeTrueTrigger();
  const sushiSwapExactXForY = await ethers.getContract("SushiSwapExactXForY");
  const sushiAddLiquidity = await ethers.getContract("SushiAddLiquidity");

  return {
    protocolAddresses,
    DAI_TOKEN,
    dai_contract,
    McFund,
    sushiSwapExactXForY,
    sushiAddLiquidity,
    trueTrigger
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
        const {
          protocolAddresses,
          DAI_TOKEN,
          trueTrigger,
          McFund,
          sushiSwapExactXForY,
          dai_contract
        } = await testPreReqs();

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
            trueTrigger,
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
        const {
          protocolAddresses,
          DAI_TOKEN,
          trueTrigger,
          McFund,
          sushiSwapExactXForY,
          dai_contract
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
          trueTrigger,
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
            trueTrigger,
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
        const { protocolAddresses, DAI_TOKEN, trueTrigger, McFund, sushiSwapExactXForY } = await testPreReqs();
        await expect(
          McFund.takeAction(
            trueTrigger,
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
          trueTrigger,
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
          trueTrigger,
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
            trueTrigger,
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
