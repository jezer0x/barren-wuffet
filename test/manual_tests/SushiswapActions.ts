import { ethers, getNamedAccounts, hardhatArguments } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Contract, Bytes, BigNumber, utils } from "ethers";
import {
  GT,
  ERC20_DECIMALS,
  TST1_PRICE_IN_ETH,
  DEFAULT_INCENTIVE,
  ETH_PRICE_IN_USD,
  PRICE_TRIGGER_DECIMALS,
  TST1_PRICE_IN_USD,
  ETH_PRICE_IN_TST1,
  ETH_ADDRESS,
  PRICE_TRIGGER_TYPE,
  DEFAULT_SUB_TO_MAN_FEE_PCT,
  ETH_TOKEN,
  LT,
  TOKEN_TYPE,
  TIMESTAMP_TRIGGER_TYPE
} from "../Constants";
import { getAddressFromEvent } from "../helper";
import { abi as FACTORY_ABI } from "@134dd3v/uniswap-v3-core-0.8-support/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import { abi as POOL_ABI } from "@134dd3v/uniswap-v3-core-0.8-support/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";

async function makeSubConstraints() {
  const latestTime = await time.latest();
  return {
    minCollateralPerSub: BigNumber.from(10).mul(ERC20_DECIMALS),
    maxCollateralPerSub: BigNumber.from(100).mul(ERC20_DECIMALS),
    minCollateralTotal: BigNumber.from(10).mul(ERC20_DECIMALS),
    maxCollateralTotal: BigNumber.from(500).mul(ERC20_DECIMALS),
    deadline: latestTime + 86400,
    lockin: latestTime + 86400 * 10,
    allowedDepositToken: ETH_TOKEN
  };
}

async function main() {
  const BW = await ethers.getContract("BarrenWuffet");
  const McFundAddr = await getAddressFromEvent(
    BW.createFund("marlieChungerFund", await makeSubConstraints(), DEFAULT_SUB_TO_MAN_FEE_PCT, []),
    "Created",
    BW.address,
    1
  );

  const McFund = await ethers.getContractAt("Fund", McFundAddr);

  await McFund.deposit(ETH_TOKEN, BigNumber.from(11).mul(ERC20_DECIMALS), {
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

  const usdc_contract = new Contract("0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", erc20abifrag, ethers.provider);
  const dai_contract = new Contract("0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", erc20abifrag, ethers.provider);
  const USDC_TOKEN = { t: TOKEN_TYPE.ERC20, addr: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", id: BigNumber.from(0) };
  const DAI_TOKEN = { t: TOKEN_TYPE.ERC20, addr: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", id: BigNumber.from(0) };

  let balance_usdc = await usdc_contract.balanceOf(McFundAddr);

  const trueTrigger = {
    createTimeParams: utils.defaultAbiCoder.encode(["uint8", "uint256"], [GT, (await time.latest()) - 1]),
    triggerType: TIMESTAMP_TRIGGER_TYPE,
    callee: (await ethers.getContract("TimestampTrigger")).address
  };

  const sushiSwapExactXForY = await ethers.getContract("SushiSwapExactXForY");

  // Case 1: swap ETH to ERC20
  await McFund.takeAction(
    trueTrigger,
    {
      callee: sushiSwapExactXForY.address,
      data: ethers.utils.defaultAbiCoder.encode(
        ["address[]"],
        [["0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8"]]
      ),
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
      callee: sushiSwapExactXForY.address,
      data: ethers.utils.defaultAbiCoder.encode(
        ["address[]"],
        [["0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"]]
      ),
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

  // Case 3: path is wrong
  try {
    await McFund.takeAction(
      trueTrigger,
      {
        callee: sushiSwapExactXForY.address,
        data: ethers.utils.defaultAbiCoder.encode(
          ["address[]"],
          [["0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"]]
        ),
        inputTokens: [ETH_TOKEN], // eth
        outputTokens: [USDC_TOKEN] // swapping for USDC
      },
      [BigNumber.from(1).mul(ERC20_DECIMALS)],
      [BigNumber.from(0)] // 0 fees set in deploy
    );
  } catch (e) {
    console.log("Wrong _path send during swap doesn't work");
  }

  const sushiAddLiquidity = await ethers.getContract("SushiAddLiquidity");

  const usdc_weth_slp_contract = new Contract(
    "0x905dfCD5649217c42684f23958568e533C711Aa3",
    erc20abifrag,
    ethers.provider
  );

  const USDC_WETH_SLP_TOKEN = {
    t: TOKEN_TYPE.ERC20,
    addr: usdc_weth_slp_contract.address,
    id: BigNumber.from(0)
  };

  console.log(usdc_weth_slp_contract.address);

  // Case 4: add LP
  await McFund.takeAction(
    trueTrigger,
    {
      callee: sushiAddLiquidity.address,
      data: "0x",
      inputTokens: [USDC_TOKEN, ETH_TOKEN],
      outputTokens: [USDC_TOKEN, ETH_TOKEN, USDC_WETH_SLP_TOKEN]
    },
    [balance_usdc, BigNumber.from(1).mul(ERC20_DECIMALS)],
    [BigNumber.from(0), BigNumber.from(0)] // 0 fees set in deploy
  );

  console.log("WETH-USDC-SLP received after LP: ", (await usdc_weth_slp_contract.balanceOf(McFundAddr)).toString());

  // Case 5: subscribers get back the SLP token if funds are closed -> no position stuff required

  await McFund.closeFund(); // trader closes fund prematurely
  await McFund.withdraw(); // trader was subscriber himself

  const { deployer } = await getNamedAccounts();
  console.log(
    "SLP Token balance after withdraw on closed fund: ",
    (await usdc_weth_slp_contract.balanceOf(deployer)).toString()
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
