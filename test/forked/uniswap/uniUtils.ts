import { ETH_TOKEN, TOKEN_TYPE } from "../../Constants";
import { ethers } from "hardhat";
import { Contract, BigNumber, FixedNumber } from "ethers";
import { IERC20Metadata__factory } from "../../../typechain-types";
import { Address } from "hardhat-deploy/types";
import { TokenStruct } from "../../../typechain-types/contracts/utils/subscriptions/Subscriptions";
import { ActionStruct } from "../../../typechain-types/contracts/actions/IAction";
import { getActionFromBytes, multiplyNumberWithBigNumber } from "../../helper";
import { abi as FACTORY_ABI } from "@134dd3v/uniswap-v3-core-0.8-support/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import { abi as POOL_ABI } from "@134dd3v/uniswap-v3-core-0.8-support//artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";

// might not be there, in which case cd into `node_modules/@uniswap/v3-periphery` and run `npm i` and `npx hardhat compile`
// source: https://ethereum.stackexchange.com/a/136054
const QUOTER_ABI = [
  {
    inputs: [
      {
        internalType: "bytes",
        name: "path",
        type: "bytes"
      },
      {
        internalType: "uint256",
        name: "amountIn",
        type: "uint256"
      }
    ],
    name: "quoteExactInput",
    outputs: [
      {
        internalType: "uint256",
        name: "amountOut",
        type: "uint256"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  }
];

export async function getAmountOutUniSwap(
  quoter_address: Address,
  tokenIn: TokenStruct,
  tokenOut: TokenStruct,
  amountIn: BigNumber,
  fee: number,
  WETHAddr: Address
): Promise<BigNumber> {
  const quoter = new Contract(quoter_address, QUOTER_ABI, ethers.provider.getSigner());
  const amountsOut = await quoter.callStatic.quoteExactInputSingle(
    tokenIn == ETH_TOKEN ? WETHAddr : tokenIn.addr,
    tokenOut == ETH_TOKEN ? WETHAddr : tokenOut.addr,
    BigNumber.from(fee),
    amountIn,
    0
  );
  return amountsOut;
}

export async function getTokenOutPerTokenInUniSwap(
  quoter_address: Address,
  tokenIn: TokenStruct,
  tokenOut: TokenStruct,
  fee: number,
  WETHAddr: Address
) {
  const one_unit =
    tokenIn == ETH_TOKEN
      ? ethers.utils.parseEther("1")
      : ethers.utils.parseUnits(
          "1",
          await new Contract(await tokenIn.addr, IERC20Metadata__factory.abi, ethers.provider).decimals()
        );
  const res = await getAmountOutUniSwap(quoter_address, tokenIn, tokenOut, one_unit, fee, WETHAddr);
  return res;
}

export function createUniSwapAction(
  callee: Address,
  tokenIn: TokenStruct,
  tokenOut: TokenStruct,
  fee: number,
  minAmountOfOutPerIn: BigNumber
): ActionStruct {
  return {
    callee: callee,
    data: ethers.utils.defaultAbiCoder.encode(["uint24", "uint256"], [fee, minAmountOfOutPerIn]),
    inputTokens: [tokenIn],
    outputTokens: [tokenOut]
  };
}

export async function createUniMintLPAction(
  mintLPAction: Contract,
  uniswapFactoryAddr: Address,
  tokenA: TokenStruct,
  tokenB: TokenStruct,
  wethAddr: Address,
  fee: number,
  minBPerA: BigNumber,
  minAPerB: BigNumber
) {
  const MAX_TICK = 887272;
  let LP_NFT = {
    t: TOKEN_TYPE.ERC721,
    addr: await mintLPAction.nonfungiblePositionManager(),
    id: BigNumber.from(0)
  };

  const poolFactory = new Contract(uniswapFactoryAddr, FACTORY_ABI, ethers.provider);

  var tokenAAddr = tokenA == ETH_TOKEN ? wethAddr : tokenA.addr;
  var tokenBAddr = tokenB == ETH_TOKEN ? wethAddr : tokenB.addr;

  // Swapping because nonfungiblePositionManager does not do this automatically
  if (tokenAAddr > tokenBAddr) {
    throw Error("tokenA.addr MUST be < tokenB.addr. Please adjust the order and collaterals accordingly.");
  }

  const pool = new Contract(await poolFactory.getPool(tokenAAddr, tokenBAddr, fee), POOL_ABI, ethers.provider);

  // We only allow full range LPs now, like uniswap v2
  var Tsp = parseInt(await pool.tickSpacing());
  var minTick = Math.ceil((-1 * MAX_TICK) / Tsp) * Tsp;
  var maxTick = Math.floor(MAX_TICK / Tsp) * Tsp;

  return {
    callee: mintLPAction.address,
    data: ethers.utils.defaultAbiCoder.encode(
      ["uint24", "int24", "int24", "uint256", "uint256"],
      [fee, minTick.toString(), maxTick.toString(), minBPerA, minAPerB]
    ),
    inputTokens: [tokenA, tokenB],
    outputTokens: [tokenA, tokenB, LP_NFT]
  };
}

export function createUniBurnAction(actionAsBytes: any) {
  return getActionFromBytes(actionAsBytes);
}
