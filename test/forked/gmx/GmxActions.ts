import { ethers, getNamedAccounts, config, deployments } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber, utils, ContractReceipt, ContractTransaction } from "ethers";
import { ERC20_DECIMALS, ETH_TOKEN, TOKEN_TYPE } from "../../Constants";
import { setupEnvForGmxTests, setupEnvForUniTests } from "../forkFixtures";
import { makeTrueTrigger } from "../../Fixtures";
import { encodeMinBPerA } from "../sushiswap/sushiUtils";
import { getArgsFromEvent, getFees, isForked, multiplyNumberWithBigNumber } from "../../helper";
import { expect } from "chai";
import { createGmxSwapAction, getTokenOutPerTokenInGmxSwap } from "./gmxUtils";

const DEFAULT_SLIPPAGE = 0.97;
const NUM_ETH = 1;

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

      const daiPerETHBN = await getTokenOutPerTokenInGmxSwap(
        gmxReader,
        await gmxRouter.vault(),
        ETH_TOKEN,
        DAI_TOKEN,
        protocolAddresses.tokens.WETH
      );

      const daiPerETH = parseFloat(ethers.utils.formatUnits(daiPerETHBN, 18));
      let collaterals = [ethers.utils.parseEther(NUM_ETH.toString())];
      await expect(
        McFund.takeAction(
          await makeTrueTrigger(),
          createGmxSwapAction(
            swapGmxAction.address,
            ETH_TOKEN,
            DAI_TOKEN,
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
          createGmxSwapAction(
            swapGmxAction.address,
            DAI_TOKEN,
            ETH_TOKEN,
            BigNumber.from(0) // await encodeMinBPerA(DAI_TOKEN, ETH_TOKEN, (1.0 / daiPerETH) * DEFAULT_SLIPPAGE)
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
});

/*
  async function main() {
  const protocolAddresses: any = await getProtocolAddresses("31337");
  const BW = await ethers.getContract("BarrenWuffet");
  const McFundAddr = await getAddressFromEvent(
    BW.createFund("marlieChungerFund", await makeDefaultSubConstraints(), DEFAULT_SUB_TO_MAN_FEE_PCT, []),
    "Created",
    BW.address,
    1
  );

  const McFund = await ethers.getContractAt("Fund", McFundAddr);

  await McFund.deposit(ETH_TOKEN, BigNumber.from(21).mul(ERC20_DECIMALS), {
    value: BigNumber.from(11).mul(ERC20_DECIMALS)
  });

  // increase to beyond deadline so we can start taking actions
  await time.increaseTo((await time.latest()) + 86400);
  const erc20abifrag = [
    {
      constant: true,
      inputs: [
        {
          name: "_owner",
          type: "address"
        }
      ],
      name: "balanceOf",
      outputs: [
        {
          name: "balance",
          type: "uint256"
        }
      ],
      payable: false,
      type: "function"
    }
  ];

  const usdc_contract = new Contract(protocolAddresses.tokens.USDC, erc20abifrag, ethers.provider);
  const dai_contract = new Contract("0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", erc20abifrag, ethers.provider);
  const USDC_TOKEN = { t: TOKEN_TYPE.ERC20, addr: protocolAddresses.tokens.USDC, id: BigNumber.from(0) };
  const DAI_TOKEN = { t: TOKEN_TYPE.ERC20, addr: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", id: BigNumber.from(0) };

  let balance_usdc = await usdc_contract.balanceOf(McFundAddr);

  const trueTrigger = {
    createTimeParams: utils.defaultAbiCoder.encode(["uint8", "uint256"], [GT, (await time.latest()) - 1]),
    triggerType: TIMESTAMP_TRIGGER_TYPE,
    callee: (await ethers.getContract("TimestampTrigger")).address
  };

  const gmxSwap = await ethers.getContract("GmxSwap");

  // Case 1: swap ETH to ERC20
  await McFund.takeAction(
    trueTrigger,
    {
      callee: gmxSwap.address,
      data: "0x",
      inputTokens: [ETH_TOKEN], // eth
      outputTokens: [USDC_TOKEN] // swapping for USDC
    },
    [BigNumber.from(2).mul(ERC20_DECIMALS)],
    [BigNumber.from(0)] // 0 fees set in deploy
  );

  balance_usdc = await usdc_contract.balanceOf(McFundAddr);
  console.log("USDC balance after selling 2 ETH:", balance_usdc.toString());

  // Case 2: Swap ERC20 to ETH
  let prevEthBalance = await ethers.provider.getBalance(McFundAddr);
  await McFund.takeAction(
    trueTrigger,
    {
      callee: gmxSwap.address,
      data: "0x",
      inputTokens: [USDC_TOKEN],
      outputTokens: [ETH_TOKEN]
    },
    [(await usdc_contract.balanceOf(McFundAddr)).div(2)],
    [BigNumber.from(0)] // 0 fees set in deploy
  );
  let postEthBalance = await ethers.provider.getBalance(McFundAddr);
  console.log(
    "Ether received after selling half the USDC: ",
    ethers.utils.formatEther(postEthBalance.sub(prevEthBalance))
  );
  balance_usdc = await usdc_contract.balanceOf(McFundAddr);

  const gmxIncreasePosition = await ethers.getContract("GmxIncreasePosition");

  //   struct IncreasePositionParams {
  //     address[] _path;
  //     address _indexToken;
  //     uint256 _minOut;
  //     uint256 _sizeDelta;
  //     bool _isLong;
  //     uint256 _acceptablePrice;
  // }

  await McFund.takeAction(
    trueTrigger,
    {
      callee: gmxIncreasePosition.address,
      data: ethers.utils.defaultAbiCoder.encode(
        ["tuple(address[], address, uint256, uint256, bool, uint256)"],
        [
          [
            [protocolAddresses.tokens.USDC, protocolAddresses.tokens.WETH],
            protocolAddresses.tokens.WETH,
            0,
            balance_usdc
              .mul(2)
              .mul(BigNumber.from(10).pow(30))
              .div(BigNumber.from(10).pow(6)), // 2x long on ETH price
            true,
            BigNumber.from(2000).mul(BigNumber.from(10).pow(30)) // entry price of 2000
          ]
        ]
      ),
      inputTokens: [USDC_TOKEN, ETH_TOKEN],
      outputTokens: []
    },
    [balance_usdc, BigNumber.from(100000000000000)],
    [BigNumber.from(0), BigNumber.from(0)]
  );

  const confirmReqExecOrCancel = await ethers.getContract("GmxConfirmRequestExecOrCancel");
  const gmxReader = new Contract("0x22199a49A999c351eF7927602CFB187ec3cae489", Reader.abi, ethers.provider);
  const gmxRouter = new Contract("0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064", Router.abi, ethers.provider);
  const gmxPositionRouter = new Contract(
    "0x3D6bA331e3D9702C5e8A8d254e5d8a285F223aba",
    PositionRouter.abi,
    ethers.provider
  );

  const rc = await McFund.roboCop();
  var key = await gmxPositionRouter.getRequestKey(rc, await gmxPositionRouter.increasePositionsIndex(rc));

  try {
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
  } catch (e) {
    console.log("Successfully failed at confirming reqExec!");
  }

  // impersonated admin tries to make himself a keeper and then execute the increase position
  const gmxAdminAddr = await gmxPositionRouter.admin();
  await impersonateAccount(gmxAdminAddr);
  const gmxAdmin = await ethers.getSigner(gmxAdminAddr);
  const gmxPositionRouterByAdmin = new Contract(gmxPositionRouter.address, PositionRouter.abi, gmxAdmin);
  await gmxPositionRouterByAdmin.setPositionKeeper(gmxAdminAddr, true);
  await gmxPositionRouterByAdmin.executeIncreasePosition(key, gmxAdmin.address);

  // confirm exec passes
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
