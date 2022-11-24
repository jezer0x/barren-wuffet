import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import { addToWhitelist, getLibraries } from "../utils";
import { Contract } from "ethers";
import dotenv from "dotenv";
import { getProtocolAddresses } from "../protocol_addresses";
import { isForked } from "../../test/helper";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const protocolAddresses = await getProtocolAddresses(await getChainId());
  dotenv.config({ path: (await getChainId()) == "31337" ? ".test.env" : ".env", override: true });
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const { TokenLibAddr } = await getLibraries();

  const whitelistService = await ethers.getContract("WhitelistService");
  const actWlHash = await whitelistService.getWhitelistHash(deployer, "actions");

  log("> Deploying Actions ");

  if (!(await whitelistService.whitelistExists(actWlHash))) {
    await whitelistService.createWhitelist("actions");
    log("actions whitelist created as ", whitelistService.address, "::", actWlHash);
  } else {
    log("triggers whitelist already exists as ", whitelistService.address, "::", actWlHash);
  }

  await deployUniswapActions(deploy, deployer, whitelistService, actWlHash, TokenLibAddr, protocolAddresses, log);

  await deploySushiActions(deploy, deployer, whitelistService, actWlHash, TokenLibAddr, protocolAddresses, log);

  await deployGmxActions(deploy, deployer, whitelistService, actWlHash, TokenLibAddr, protocolAddresses, log);

  if ((await whitelistService.getWhitelistOwner(actWlHash)) == deployer) {
    await whitelistService.transferWhitelistOwnership(actWlHash, process.env.PLATFORM_MULTI_SIG_ADDR);
    log(actWlHash, " ownership transferred to ", process.env.PLATFORM_MULTI_SIG_ADDR);
  } else {
    console.error("The Action Whitelist is already owned by ", await whitelistService.getWhitelistOwner(actWlHash));
  }

  log("\n");
};

async function deployUniswapActions(
  deploy: any,
  deployer: string,
  whitelistService: Contract,
  actWlHash: any,
  TokenLibAddr: string,
  protocolAddresses: any,
  logFn: any
) {
  let uniswapRouterAddr;
  let nonfungiblePositionManagerAddr;
  let weth9Addr;

  uniswapRouterAddr = protocolAddresses.uniswap.swap_router;
  nonfungiblePositionManagerAddr = protocolAddresses.uniswap.non_fungible_position_manager;
  weth9Addr = protocolAddresses.tokens.WETH;

  const uniSwapExactInputSingle = await deploy("UniSwapExactInputSingle", {
    from: deployer,
    args: [uniswapRouterAddr, weth9Addr],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  const UniSweepAndBurnLiquidityPositionAction = await deploy("UniSweepAndBurnLiquidityPosition", {
    from: deployer,
    args: [nonfungiblePositionManagerAddr, weth9Addr],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  const UniMintLiquidityPositionAction = await deploy("UniMintLiquidityPosition", {
    from: deployer,
    args: [nonfungiblePositionManagerAddr, weth9Addr, UniSweepAndBurnLiquidityPositionAction.address],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  const UniCollectFeesAction = await deploy("UniCollectFees", {
    from: deployer,
    args: [nonfungiblePositionManagerAddr, weth9Addr],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  const UniIncreaseLiquidityAction = await deploy("UniIncreaseLiquidity", {
    from: deployer,
    args: [nonfungiblePositionManagerAddr, weth9Addr],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  const UniDecreaseLiquidityAction = await deploy("UniDecreaseLiquidity", {
    from: deployer,
    args: [nonfungiblePositionManagerAddr, weth9Addr],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  await addToWhitelist(deployer, whitelistService, actWlHash, uniSwapExactInputSingle.address, logFn);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniSweepAndBurnLiquidityPositionAction.address, logFn);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniMintLiquidityPositionAction.address, logFn);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniCollectFeesAction.address, logFn);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniIncreaseLiquidityAction.address, logFn);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniDecreaseLiquidityAction.address, logFn);
}

async function deploySushiActions(
  deploy: any,
  deployer: string,
  whitelistService: Contract,
  actWlHash: any,
  TokenLibAddr: string,
  protocolAddresses: any,
  logFn: any
) {
  let router = protocolAddresses.sushiswap.swap_router;
  let weth9Addr = protocolAddresses.tokens.WETH;

  const sushiSwapExactXForY = await deploy("SushiSwapExactXForY", {
    from: deployer,
    args: [router, weth9Addr],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  const sushiAddLiquidity = await deploy("SushiAddLiquidity", {
    from: deployer,
    args: [router],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  const sushiRemoveLiquidity = await deploy("SushiRemoveLiquidity", {
    from: deployer,
    args: [router],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  await addToWhitelist(deployer, whitelistService, actWlHash, sushiSwapExactXForY.address, logFn);
  await addToWhitelist(deployer, whitelistService, actWlHash, sushiAddLiquidity.address, logFn);
  await addToWhitelist(deployer, whitelistService, actWlHash, sushiRemoveLiquidity.address, logFn);
}

async function deployGmxActions(
  deploy: any,
  deployer: string,
  whitelistService: Contract,
  actWlHash: any,
  TokenLibAddr: string,
  protocolAddresses: any,
  logFn: any
) {
  // Note: tests will fail against Gmx if run on unforked network
  let router = protocolAddresses.gmx.router;
  let position_router = protocolAddresses.gmx.position_router;
  let reader = protocolAddresses.gmx.reader;

  const gmxSwap = await deploy("GmxSwap", {
    from: deployer,
    args: [router, reader],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  const gmxConfirmNoPosition = await deploy("GmxConfirmNoPosition", {
    from: deployer,
    args: [reader, position_router],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  const gmxConfirmRequestExecOrCancel = await deploy("GmxConfirmRequestExecOrCancel", {
    from: deployer,
    args: [reader, position_router, gmxConfirmNoPosition.address],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  const gmxIncreasePosition = await deploy("GmxIncreasePosition", {
    from: deployer,
    args: [reader, position_router, gmxConfirmRequestExecOrCancel.address, ethers.constants.HashZero],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  const gmxDecreasePosition = await deploy("GmxDecreasePosition", {
    from: deployer,
    args: [reader, position_router, gmxConfirmRequestExecOrCancel.address],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  await addToWhitelist(deployer, whitelistService, actWlHash, gmxSwap.address, logFn);
  await addToWhitelist(deployer, whitelistService, actWlHash, gmxIncreasePosition.address, logFn);
  await addToWhitelist(deployer, whitelistService, actWlHash, gmxDecreasePosition.address, logFn);
  await addToWhitelist(deployer, whitelistService, actWlHash, gmxConfirmRequestExecOrCancel.address, logFn);
  await addToWhitelist(deployer, whitelistService, actWlHash, gmxConfirmNoPosition.address, logFn);
}

export default func;
func.tags = ["Actions"];
func.dependencies = ["TestStubs", "Libraries", "WhitelistService"];
