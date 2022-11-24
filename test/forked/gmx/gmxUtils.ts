import { ETH_TOKEN, TOKEN_TYPE } from "../../Constants";
import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { IERC20Metadata__factory } from "../../../typechain-types";
import { Address } from "hardhat-deploy/types";
import { TokenStruct } from "../../../typechain-types/contracts/utils/subscriptions/Subscriptions";
import { ActionStruct } from "../../../typechain-types/contracts/actions/IAction";
import { getActionFromBytes, multiplyNumberWithBigNumber } from "../../helper";
import { abi as FACTORY_ABI } from "@134dd3v/uniswap-v3-core-0.8-support/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import { abi as POOL_ABI } from "@134dd3v/uniswap-v3-core-0.8-support//artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";

export async function getTokenOutPerTokenInGmxSwap(
  reader: Contract,
  vaultAddr: Address,
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
  return await getAmountOutGmxSwap(reader, vaultAddr, tokenIn, tokenOut, one_unit, WETHAddr);
}

export async function getAmountOutGmxSwap(
  reader: Contract,
  vaultAddr: Address,
  tokenIn: TokenStruct,
  tokenOut: TokenStruct,
  amountIn: BigNumber,
  WETHAddr: Address
): Promise<BigNumber> {
  return (
    await reader.getAmountOut(
      vaultAddr,
      tokenIn == ETH_TOKEN ? WETHAddr : tokenIn.addr,
      tokenOut == ETH_TOKEN ? WETHAddr : tokenOut.addr,
      amountIn
    )
  )[0];
}

export function createGmxSwapAction(
  callee: Address,
  tokenIn: TokenStruct,
  tokenOut: TokenStruct,
  minAmountOfOutPerIn: BigNumber
): ActionStruct {
  return {
    callee: callee,
    data: ethers.utils.defaultAbiCoder.encode(["uint256"], [minAmountOfOutPerIn]),
    inputTokens: [tokenIn],
    outputTokens: [tokenOut]
  };
}

export function createIncreasePositionAction(
  callee: Address,
  tokenIn: TokenStruct,
  indexTokenAddr: Address,
  minAmountOfOutPerInForSwap: BigNumber, // leave this as 0 if you don't have to swap
  leverage: BigNumber, // this is only indicative. Actual leverage depends on inputTokenPrice, leverage given and indexTokenPrice at the point of order execution
  inputTokenPrice: number, // in USD
  acceptableIndexTokenPrice: number, // in USD
  WETHAddr: Address,
  collateralTokenAddr: Address | undefined = undefined
) {
  // struct IncreasePositionParamsCustom {
  //     address[] _path;
  //     address _indexToken;
  //     uint256 _minOutYPerXSwap;
  //     uint256 _leverage;
  //     uint256 _inputTokenPrice;
  //     bool _isLong;
  //     uint256 _acceptableIndexTokenPrice;
  // }

  return {
    callee: callee,
    data: ethers.utils.defaultAbiCoder.encode(
      ["tuple(address[], address, uint256, uint256, uint256, bool, uint256)"],
      [
        [
          [tokenIn == ETH_TOKEN ? WETHAddr : tokenIn.addr].concat(collateralTokenAddr ? [collateralTokenAddr] : []),
          indexTokenAddr,
          minAmountOfOutPerInForSwap,
          leverage,
          multiplyNumberWithBigNumber(inputTokenPrice, BigNumber.from(10).pow(30)),
          true,
          multiplyNumberWithBigNumber(acceptableIndexTokenPrice, BigNumber.from(10).pow(30))
        ]
      ]
    ),
    inputTokens: [tokenIn, ETH_TOKEN],
    outputTokens: []
  };
}

export function createGmxConfirmCancelOrExecRequestAction(actionAsBytes: any) {
  return getActionFromBytes(actionAsBytes);
}
