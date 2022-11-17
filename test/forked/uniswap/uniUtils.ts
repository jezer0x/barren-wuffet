import { ETH_TOKEN, TOKEN_TYPE } from "../../Constants";
import { ethers } from "hardhat";
import { Contract, BigNumber, FixedNumber } from "ethers";
import {
  IERC20Metadata__factory,
  IUniswapV2Factory__factory,
  IUniswapV2Pair__factory,
  IUniswapV2Router02__factory
} from "../../../typechain-types";
import { Address } from "hardhat-deploy/types";
import { TokenStruct } from "../../../typechain-types/contracts/utils/subscriptions/Subscriptions";
import { ActionStruct } from "../../../typechain-types/contracts/actions/IAction";
import { multiplyNumberWithBigNumber } from "../../helper";
import { abi as FACTORY_ABI } from "@134dd3v/uniswap-v3-core-0.8-support/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import { abi as POOL_ABI } from "@134dd3v/uniswap-v3-core-0.8-support//artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";

// might not be there, in which case cd into `node_modules/@uniswap/v3-periphery` and run `npm i` and `npx hardhat compile`
// source: https://ethereum.stackexchange.com/a/136054
import { abi as QUOTER_ABI } from "@uniswap/v3-periphery/artifacts/contracts/interfaces/IQuoter.sol/IQuoter.json";
import { encodeMinBPerA } from "../sushiswap/sushiUtils";

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
  minXPerY: BigNumber,
  minYPerX: BigNumber
) {
  let LP_NFT = {
    t: TOKEN_TYPE.ERC721,
    addr: await mintLPAction.nonfungiblePositionManager(),
    id: BigNumber.from(0)
  };

  const poolFactory = new Contract(uniswapFactoryAddr, FACTORY_ABI, ethers.provider);
  const pool = new Contract(
    await poolFactory.getPool(
      tokenA == ETH_TOKEN ? wethAddr : tokenA.addr,
      tokenB == ETH_TOKEN ? wethAddr : tokenB.addr,
      fee
    ),
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

  return {
    callee: mintLPAction.address,
    data: ethers.utils.defaultAbiCoder.encode(
      ["uint24", "int24", "int24", "uint256", "uint256"],
      [500, NLT.toString(), NHT.toString(), minXPerY, minYPerX]
    ),
    inputTokens: [tokenA, tokenB],
    outputTokens: [tokenA, tokenB, LP_NFT]
  };
}
