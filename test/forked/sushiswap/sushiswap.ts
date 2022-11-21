import { expect } from "chai";
import { makeTrueTrigger } from "../../Fixtures";
import { ETH_TOKEN } from "../../Constants";
import { config, ethers, deployments } from "hardhat";
import { Contract, BigNumber, utils } from "ethers";
import { IERC20Metadata__factory } from "../../../typechain-types";
import {
  createSushiAddLiquidityAction,
  createSushiRemoveLiquidityAction,
  createSushiSwapAction,
  encodeMinBPerA,
  getSLPToken,
  getTokenOutPerTokenInSushiSwap,
  getTokensFromSLP,
  getTokensOutPerSLP
} from "./sushiUtils";
import { setupEnvForSushiTests } from "../forkFixtures";
import { getFees, isForked, multiplyNumberWithBigNumber } from "../../helper";

const DEFAULT_SLIPPAGE = 0.97;
const NUM_ETHER = 2;

describe("Sushiswap", () => {
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

  describe("swap", () => {
    it("Should sell NUM_ETHER ETH for DAI and then swap back for almost all the ETH", async () => {
      const { protocolAddresses, DAI_TOKEN, McFund, sushiSwapExactXForY, dai_contract } = await testPreReqs();

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

      let collaterals = [ethers.utils.parseEther(String(NUM_ETHER))];
      await expect(
        McFund.takeAction(
          await makeTrueTrigger(),
          createSushiSwapAction(
            sushiSwapExactXForY.address,
            ETH_TOKEN,
            DAI_TOKEN,
            await encodeMinBPerA(ETH_TOKEN, DAI_TOKEN, daiPerETH * DEFAULT_SLIPPAGE), // some slippage tolerance
            protocolAddresses.tokens.WETH
          ),
          collaterals,
          await getFees(McFund, collaterals)
        )
      ).to.changeEtherBalance(McFund.address, ethers.utils.parseEther(`-${NUM_ETHER}`));

      expect(
        (await dai_contract.balanceOf(McFund.address)) >=
          ethers.utils.parseUnits(String(daiPerETH * NUM_ETHER * DEFAULT_SLIPPAGE), 18)
      );

      // swap DAI back to ETH
      const dai_balance = await dai_contract.balanceOf(McFund.address);
      const prev_eth_balance = await ethers.provider.getBalance(McFund.address);

      collaterals = [dai_balance];
      await expect(
        McFund.takeAction(
          await makeTrueTrigger(),
          createSushiSwapAction(
            sushiSwapExactXForY.address,
            DAI_TOKEN,
            ETH_TOKEN,
            await encodeMinBPerA(DAI_TOKEN, ETH_TOKEN, (1.0 / daiPerETH) * DEFAULT_SLIPPAGE),
            protocolAddresses.tokens.WETH
          ),
          collaterals,
          await getFees(McFund, collaterals)
        )
      ).to.changeTokenBalance(dai_contract, McFund.address, dai_balance.mul(-1));

      expect(
        (await ethers.provider.getBalance(McFund.address)).sub(prev_eth_balance) >
          multiplyNumberWithBigNumber(DEFAULT_SLIPPAGE / daiPerETH, dai_balance)
      );
    });

    it("Should revert if wrong path is given", async () => {
      let collaterals = [ethers.utils.parseEther("1")];
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
          collaterals,
          await getFees(McFund, collaterals)
        )
      ).to.be.reverted;
    });
  });

  describe("add and remove lp", () => {
    it("Should give back LP ERC20 tokens when liquidity is added and give back tokens when liquidity is removed", async () => {
      const {
        protocolAddresses,
        DAI_TOKEN,
        McFund,
        dai_contract,
        sushiAddLiquidity,
        sushiSwapExactXForY,
        sushiRemoveLiquidity
      } = await testPreReqs();

      // Get some DAI first
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

      let collaterals = [ethers.utils.parseEther(String(NUM_ETHER))];
      await McFund.takeAction(
        await makeTrueTrigger(),
        createSushiSwapAction(
          sushiSwapExactXForY.address,
          ETH_TOKEN,
          DAI_TOKEN,
          await encodeMinBPerA(ETH_TOKEN, DAI_TOKEN, daiPerETH * DEFAULT_SLIPPAGE), // some slippage tolerance
          protocolAddresses.tokens.WETH
        ),
        collaterals,
        await getFees(McFund, collaterals)
      );

      let balance_dai = await dai_contract.balanceOf(McFund.address);
      let balance_eth = await ethers.provider.getBalance(McFund.address);

      collaterals = [ethers.utils.parseEther(NUM_ETHER.toString()), balance_dai];
      await McFund.takeAction(
        await makeTrueTrigger(),
        await createSushiAddLiquidityAction(
          sushiAddLiquidity.address,
          protocolAddresses.sushiswap.swap_router,
          ETH_TOKEN,
          DAI_TOKEN,
          await encodeMinBPerA(ETH_TOKEN, DAI_TOKEN, daiPerETH * DEFAULT_SLIPPAGE), // some slippage tolerance
          await encodeMinBPerA(DAI_TOKEN, ETH_TOKEN, (1.0 / daiPerETH) * DEFAULT_SLIPPAGE), // some slippage tolerance
          protocolAddresses.tokens.WETH
        ),
        collaterals,
        await getFees(McFund, collaterals)
      );

      expect(
        balance_eth.sub(await ethers.provider.getBalance(McFund.address)) >=
          ethers.utils.parseEther(String(daiPerETH * DEFAULT_SLIPPAGE))
      );

      expect(
        balance_dai.sub(await dai_contract.balanceOf(McFund.address)) >=
          multiplyNumberWithBigNumber(DEFAULT_SLIPPAGE, balance_dai)
      );

      const dai_weth_slp_token = await getSLPToken(
        protocolAddresses.sushiswap.swap_router,
        protocolAddresses.tokens.WETH,
        ETH_TOKEN,
        DAI_TOKEN
      );

      const dai_weth_slp_contract = new Contract(dai_weth_slp_token.addr, IERC20Metadata__factory.abi, ethers.provider);

      expect((await dai_weth_slp_contract.balanceOf(McFund.address)) > 0);

      // Don't need to do the tokenA and tokenB stuff because we already know what they are (DAI and ETH)
      // But doing so for demo purposes as it'll be needed in frontend
      const { tokenA, tokenB } = await getTokensFromSLP(dai_weth_slp_token);
      const { amountAPerSLP, amountBPerSLP } = await getTokensOutPerSLP(dai_weth_slp_token);
      const minTokenAPerSLP = await encodeMinBPerA(
        dai_weth_slp_token,
        tokenA,
        parseFloat(
          ethers.utils.formatUnits(
            amountAPerSLP,
            await new Contract(tokenA.addr, IERC20Metadata__factory.abi, ethers.provider).decimals()
          )
        ) * DEFAULT_SLIPPAGE
      ); // some slippage tolerance

      const minTokenBPerSLP = await encodeMinBPerA(
        dai_weth_slp_token,
        tokenB,
        parseFloat(
          ethers.utils.formatUnits(
            amountBPerSLP,
            await new Contract(tokenB.addr, IERC20Metadata__factory.abi, ethers.provider).decimals()
          )
        ) * DEFAULT_SLIPPAGE
      ); // some slippage tolerance

      balance_dai = await dai_contract.balanceOf(McFund.address);
      balance_eth = await ethers.provider.getBalance(McFund.address);
      collaterals = [await dai_weth_slp_contract.balanceOf(McFund.address)];

      await McFund.takeAction(
        await makeTrueTrigger(),
        await createSushiRemoveLiquidityAction(
          sushiRemoveLiquidity.address,
          dai_weth_slp_token,
          minTokenAPerSLP,
          minTokenBPerSLP
        ),
        collaterals,
        await getFees(McFund, collaterals)
      );

      expect(
        (await ethers.provider.getBalance(McFund.address)).sub(balance_eth) >=
          multiplyNumberWithBigNumber(DEFAULT_SLIPPAGE, amountAPerSLP.mul(collaterals[0]))
      );
      expect(
        (await dai_contract.balanceOf(McFund.address)).sub(balance_dai) >=
          multiplyNumberWithBigNumber(DEFAULT_SLIPPAGE, amountBPerSLP.mul(collaterals[0]))
      );
      expect((await dai_weth_slp_contract.balanceOf(McFund.address)) == 0);
    });
  });
});
