import { ETH_TOKEN } from "../../Constants";
import { ethers } from "hardhat";
import { Contract, BigNumber, FixedNumber } from "ethers";
import { IERC20Metadata__factory, IUniswapV2Router02__factory } from "../../../typechain-types";
import { Address } from "hardhat-deploy/types";
import { TokenStruct } from "../../../typechain-types/contracts/utils/subscriptions/Subscriptions";
import { ActionStruct } from "../../../typechain-types/contracts/actions/IAction";

export async function calculateMinOutPerInForSwap(
  tokenIn: TokenStruct,
  tokenOut: TokenStruct,
  minAmountOfOutPerIn: Number
): Promise<BigNumber> {
  const tokenInAsERC20 = new Contract(await tokenIn.addr, IERC20Metadata__factory.abi, ethers.provider);
  const tokenOutAsERC20 = new Contract(await tokenOut.addr, IERC20Metadata__factory.abi, ethers.provider);
  var tokenInDecimals = tokenIn == ETH_TOKEN ? 18 : await tokenInAsERC20.decimals();
  var tokenOutDecimals = tokenOut == ETH_TOKEN ? 18 : await tokenOutAsERC20.decimals();
  return BigNumber.from(
    FixedNumber.from(minAmountOfOutPerIn.toFixed(18)) // toFixed(18) to catch case of FixedNumber.from(1.0/1100) failing
      .mulUnsafe(FixedNumber.from(BigNumber.from(10).pow(tokenOutDecimals + 18 - tokenInDecimals))) // I don't know why mulUnsafe!
      .toString()
      .split(".")[0] // BigNumber can't take decimal...
  );
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
