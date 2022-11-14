import { ETH_TOKEN, TOKEN_TYPE } from "../../Constants";
import { ethers } from "hardhat";
import { Contract, BigNumber, FixedNumber } from "ethers";
import {
  IERC20Metadata__factory,
  IUniswapV2Factory__factory,
  IUniswapV2Router02__factory
} from "../../../typechain-types";
import { Address } from "hardhat-deploy/types";
import { TokenStruct } from "../../../typechain-types/contracts/utils/subscriptions/Subscriptions";
import { ActionStruct } from "../../../typechain-types/contracts/actions/IAction";
import { multiplyNumberWithBigNumber } from "../../helper";

export async function encodeMinBPerA(
  tokenA: TokenStruct,
  tokenB: TokenStruct,
  minAmountOfBPerA: Number
): Promise<BigNumber> {
  const tokenAAsERC20 = new Contract(await tokenA.addr, IERC20Metadata__factory.abi, ethers.provider);
  const tokenBAsERC20 = new Contract(await tokenB.addr, IERC20Metadata__factory.abi, ethers.provider);
  var tokenADecimals = tokenA == ETH_TOKEN ? 18 : await tokenAAsERC20.decimals();
  var tokenBDecimals = tokenB == ETH_TOKEN ? 18 : await tokenBAsERC20.decimals();
  return multiplyNumberWithBigNumber(minAmountOfBPerA, BigNumber.from(10).pow(tokenBDecimals + 18 - tokenADecimals));
}

function createPath(tokenIn: TokenStruct, tokenOut: TokenStruct, WETHAddr: Address) {
  return [tokenIn == ETH_TOKEN ? WETHAddr : tokenIn.addr, tokenOut == ETH_TOKEN ? WETHAddr : tokenOut.addr];
}
// Will only work for single hops (i.e. path.length == 2)
export function createSushiSwapAction(
  callee: Address,
  tokenIn: TokenStruct,
  tokenOut: TokenStruct,
  minAmountOfOutPerIn: BigNumber,
  WETHAddr: Address
): ActionStruct {
  return {
    callee: callee,
    data: ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint256"],
      [createPath(tokenIn, tokenOut, WETHAddr), minAmountOfOutPerIn]
    ),
    inputTokens: [tokenIn],
    outputTokens: [tokenOut]
  };
}

export async function createSushiAddLiquidityAction(
  callee: Address,
  swap_router: Address,
  tokenA: TokenStruct,
  tokenB: TokenStruct,
  minAmountOfAPerB: BigNumber,
  minAmountOfBPerA: BigNumber,
  WETHAddr: Address
) {
  return {
    callee: callee,
    data: ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [minAmountOfAPerB, minAmountOfBPerA]),
    inputTokens: [tokenA, tokenB],
    outputTokens: [tokenA, tokenB, await getSLPToken(swap_router, WETHAddr, tokenA, tokenB)]
  };
}

export async function getSLPToken(swap_router: Address, WETHAddr: Address, token1: TokenStruct, token2: TokenStruct) {
  const sushiSwapRouter = new Contract(swap_router, IUniswapV2Router02__factory.abi, ethers.provider);

  const sushiSwapFactory = new Contract(
    await sushiSwapRouter.factory(),
    IUniswapV2Factory__factory.abi,
    ethers.provider
  );

  const slp_addr = await sushiSwapFactory.getPair(
    token1 == ETH_TOKEN ? WETHAddr : token1.addr,
    token2 == ETH_TOKEN ? WETHAddr : token2.addr
  );

  return {
    t: TOKEN_TYPE.ERC20,
    addr: slp_addr,
    id: BigNumber.from(0)
  };
}

export async function getAmountOutSushi(
  swap_router_address: Address,
  tokenIn: TokenStruct,
  tokenOut: TokenStruct,
  amountIn: BigNumber,
  WETHAddr: Address
): Promise<BigNumber> {
  const sushiSwapRouter = new Contract(swap_router_address, IUniswapV2Router02__factory.abi, ethers.provider);
  const amountsOut = await sushiSwapRouter.getAmountsOut(amountIn, createPath(tokenIn, tokenOut, WETHAddr));
  return amountsOut[1];
}

export async function getTokenOutPerTokenIn(
  swap_router_address: Address,
  tokenIn: TokenStruct,
  tokenOut: TokenStruct,
  WETHAddr: Address
) {
  const one_unit =
    tokenIn == ETH_TOKEN
      ? ethers.utils.parseEther("1")
      : ethers.utils.parseUnits(
          "1",
          await new Contract(await tokenIn.addr, IERC20Metadata__factory.abi, ethers.provider).decimals()
        );
  return await getAmountOutSushi(swap_router_address, tokenIn, tokenOut, one_unit, WETHAddr);
}
