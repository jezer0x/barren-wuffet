import { ethers, getNamedAccounts, config, deployments } from "hardhat";
import { impersonateAccount, time } from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber, utils, ContractReceipt, ContractTransaction } from "ethers";
import { ERC20_DECIMALS, ETH_TOKEN, TOKEN_TYPE } from "../../Constants";
import { setupEnvForGmxTests, setupEnvForUniTests } from "../forkFixtures";
import { makeTrueTrigger } from "../../Fixtures";
import { encodeMinBPerA } from "../sushiswap/sushiUtils";
import { getArgsFromEvent, getFees, isForked, multiplyNumberWithBigNumber } from "../../helper";
import { expect } from "chai";
import {
  createGmxConfirmCancelOrExecRequestAction,
  createGmxSwapAction,
  createIncreasePositionAction,
  getTokenOutPerTokenInGmxSwap
} from "./gmxUtils";
import { abi as POSITION_ROUTER_ABI } from "./GmxPositionRouter.json";

const DEFAULT_SLIPPAGE_SWAP = 0.95;
const NUM_ETH = 10;

describe("GMX", () => {
  before(function() {
    if (!isForked()) {
      this.skip();
    }
  });

  // setup
  const testPreReqs = deployments.createFixture(async hre => {
    await deployments.fixture(["BarrenWuffet"]);
    return await setupEnvForGmxTests(hre);
  });

  describe("swap", () => {
    it("Should sell NUM_ETH ETH for DAI and then swap back for almost all the ETH", async () => {
      const {
        protocolAddresses,
        DAI_TOKEN,
        McFund,
        swapGmxAction,
        dai_contract,
        gmxReader,
        gmxRouter
      } = await testPreReqs();

      var daiPerETHBN = await getTokenOutPerTokenInGmxSwap(
        gmxReader,
        await gmxRouter.vault(),
        ETH_TOKEN,
        DAI_TOKEN,
        protocolAddresses.tokens.WETH
      );

      var daiPerETH = parseFloat(ethers.utils.formatUnits(daiPerETHBN, 18));

      let collaterals = [ethers.utils.parseEther(NUM_ETH.toString())];
      await expect(
        McFund.takeAction(
          await makeTrueTrigger(),
          createGmxSwapAction(
            swapGmxAction.address,
            ETH_TOKEN,
            DAI_TOKEN,
            await encodeMinBPerA(ETH_TOKEN, DAI_TOKEN, daiPerETH * DEFAULT_SLIPPAGE_SWAP)
          ),
          collaterals,
          await getFees(McFund, collaterals)
        )
      ).to.changeEtherBalance(McFund.address, ethers.utils.parseEther(`-${NUM_ETH}`));

      expect(
        (await dai_contract.balanceOf(McFund.address)) >=
          ethers.utils.parseUnits(String(daiPerETH * NUM_ETH * DEFAULT_SLIPPAGE_SWAP), 18)
      );

      // swap DAI back to ETH

      const ETHperDAIBN = await getTokenOutPerTokenInGmxSwap(
        gmxReader,
        await gmxRouter.vault(),
        DAI_TOKEN,
        ETH_TOKEN,
        protocolAddresses.tokens.WETH
      );

      const ETHperDAI = parseFloat(ethers.utils.formatUnits(ETHperDAIBN, 18));

      const dai_balance = await dai_contract.balanceOf(McFund.address);
      const prev_eth_balance = await ethers.provider.getBalance(McFund.address);

      collaterals = [await dai_contract.balanceOf(McFund.address)];
      await expect(
        McFund.takeAction(
          await makeTrueTrigger(),
          createGmxSwapAction(
            swapGmxAction.address,
            DAI_TOKEN,
            ETH_TOKEN,
            await encodeMinBPerA(DAI_TOKEN, ETH_TOKEN, ETHperDAI * DEFAULT_SLIPPAGE_SWAP)
          ),
          collaterals,
          await getFees(McFund, collaterals)
        )
      ).to.changeTokenBalance(dai_contract, McFund.address, dai_balance.mul(-1));

      expect(
        (await ethers.provider.getBalance(McFund.address)).sub(prev_eth_balance) >
          multiplyNumberWithBigNumber(DEFAULT_SLIPPAGE_SWAP * ETHperDAI * NUM_ETH, dai_balance)
      );
    });
  });

  describe("leverage", () => {
    it("Long ETH with ETH (starting with DAI) and then Close the long", async () => {
      const {
        protocolAddresses,
        DAI_TOKEN,
        McFund,
        increasePositionGmxAction,
        swapGmxAction,
        gmxPositionRouter,
        dai_contract,
        gmxReader,
        gmxRouter,
        McFundRoboCop,
        gmxVault
      } = await testPreReqs();

      var daiPerETHBN = await getTokenOutPerTokenInGmxSwap(
        gmxReader,
        await gmxRouter.vault(),
        ETH_TOKEN,
        DAI_TOKEN,
        protocolAddresses.tokens.WETH
      );
      var daiPerETH = parseFloat(ethers.utils.formatUnits(daiPerETHBN, 18));

      let collaterals = [ethers.utils.parseEther(NUM_ETH.toString())];

      await McFund.takeAction(
        await makeTrueTrigger(),
        createGmxSwapAction(
          swapGmxAction.address,
          ETH_TOKEN,
          DAI_TOKEN,
          await encodeMinBPerA(ETH_TOKEN, DAI_TOKEN, daiPerETH * DEFAULT_SLIPPAGE_SWAP)
        ),
        collaterals,
        await getFees(McFund, collaterals)
      );

      var balance_dai = await dai_contract.balanceOf(McFund.address);
      collaterals = [balance_dai, await gmxPositionRouter.minExecutionFee()];

      const ETHperDAIBN = await getTokenOutPerTokenInGmxSwap(
        gmxReader,
        await gmxRouter.vault(),
        DAI_TOKEN,
        ETH_TOKEN,
        protocolAddresses.tokens.WETH
      );

      const ETHperDAI = parseFloat(ethers.utils.formatUnits(ETHperDAIBN, 18));

      // leverage ETH ~2x using ETH as collateral (includes a DAI to WETH Swap as well)
      const execOrCancelActionAsBytes = (
        await getArgsFromEvent(
          McFund.takeAction(
            await makeTrueTrigger(),
            createIncreasePositionAction(
              increasePositionGmxAction.address,
              DAI_TOKEN,
              protocolAddresses.tokens.WETH,
              await encodeMinBPerA(DAI_TOKEN, ETH_TOKEN, ETHperDAI * DEFAULT_SLIPPAGE_SWAP),
              BigNumber.from(2),
              1,
              parseFloat(ethers.utils.formatUnits(await gmxVault.getMaxPrice(protocolAddresses.tokens.WETH), 30)) *
                (2 - DEFAULT_SLIPPAGE_SWAP),
              protocolAddresses.tokens.WETH,
              protocolAddresses.tokens.WETH
            ),
            collaterals,
            await getFees(McFund, collaterals)
          ),
          "PositionCreated",
          McFundRoboCop
        )
      )?.nextActions[0];

      // TODO: expect this to be in getPositions
      const confirmExecOrCancelAction = createGmxConfirmCancelOrExecRequestAction(execOrCancelActionAsBytes);
      await expect(McFund.takeAction(await makeTrueTrigger(), confirmExecOrCancelAction, [], [])).to.be.reverted;

      // impersonated admin tries to make himself a keeper and then execute the increase position
      var key = await gmxPositionRouter.getRequestKey(
        McFundRoboCop.address,
        await gmxPositionRouter.increasePositionsIndex(McFundRoboCop.address)
      );
      const gmxAdminAddr = await gmxPositionRouter.admin();
      await impersonateAccount(gmxAdminAddr);
      const gmxAdmin = await ethers.getSigner(gmxAdminAddr);
      const gmxPositionRouterByAdmin = new Contract(gmxPositionRouter.address, POSITION_ROUTER_ABI, gmxAdmin);
      await gmxPositionRouterByAdmin.setPositionKeeper(gmxAdminAddr, true);
      await gmxPositionRouterByAdmin.executeIncreasePosition(key, gmxAdmin.address);

      // this should pass now
      await expect(McFund.takeAction(await makeTrueTrigger(), confirmExecOrCancelAction, [], [])).to.not.be.reverted;

      // TODO
    });
  });
});

/*
  const confirmNoPosition = await ethers.getContract("GmxConfirmNoPosition");

  // try confirm no pos should fail
  try {
    await McFund.takeAction(trueTrigger, {
      callee: confirmNoPosition.address,
      data: ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "bool"],
        [protocolAddresses.tokens.WETH, protocolAddresses.tokens.WETH, true]
      ),
      inputTokens: [],
      outputTokens: []
    });
  } catch {
    console.log("successfully confirmed position exists");
  }

  var res = await gmxReader.getPositions(
    await gmxPositionRouter.vault(),
    rc,
    [protocolAddresses.tokens.WETH],
    [protocolAddresses.tokens.WETH],
    [true]
  );
  console.log(res);

  // decrease position

  const gmxDecreasePosition = await ethers.getContract("GmxDecreasePosition");

  //   struct DecreasePositionParams {
  //     address[] _path;
  //     address _indexToken;
  //     uint256 _collateralDelta;
  //     uint256 _sizeDelta;
  //     bool _isLong;
  //     uint256 _acceptablePrice;
  //     uint256 _minOut;
  //     bool _withdrawETH;
  // }

  // taking out the entire position
  await McFund.takeAction(
    trueTrigger,
    {
      callee: gmxDecreasePosition.address,
      data: ethers.utils.defaultAbiCoder.encode(
        ["tuple(address[], address, uint256, uint256, bool, uint256, uint256, bool)"],
        [
          [
            [protocolAddresses.tokens.WETH, protocolAddresses.tokens.USDC],
            protocolAddresses.tokens.WETH,
            0,
            balance_usdc
              .mul(2)
              .mul(BigNumber.from(10).pow(30))
              .div(BigNumber.from(10).pow(6)),
            true,
            BigNumber.from(1000).mul(BigNumber.from(10).pow(30)),
            0,
            false
          ]
        ]
      ),
      inputTokens: [ETH_TOKEN],
      outputTokens: []
    },
    [BigNumber.from(100000000000000)],
    [0]
  );

  key = await gmxPositionRouter.getRequestKey(rc, await gmxPositionRouter.decreasePositionsIndex(rc));
  await gmxPositionRouterByAdmin.executeDecreasePosition(key, gmxAdmin.address);

  await McFund.takeAction(
    trueTrigger,
    {
      callee: confirmReqExecOrCancel.address,
      data: ethers.utils.defaultAbiCoder.encode(
        ["bool", "uint256", "address", "address", "bool"],
        [true, key, protocolAddresses.tokens.USDC, protocolAddresses.tokens.WETH, true]
      ),
      inputTokens: [],
      outputTokens: []
    },
    [],
    []
  );

  res = await gmxReader.getPositions(
    await gmxPositionRouter.vault(),
    rc,
    [protocolAddresses.tokens.WETH],
    [protocolAddresses.tokens.WETH],
    [true]
  );
  console.log(res);

  // confirm no pos should pass
  await McFund.takeAction(
    trueTrigger,
    {
      callee: confirmNoPosition.address,
      data: ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "bool"],
        [protocolAddresses.tokens.WETH, protocolAddresses.tokens.WETH, true]
      ),
      inputTokens: [],
      outputTokens: []
    },
    [],
    []
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
*/
