import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import { addToWhitelist, getLibraries } from "../utils";
import { Contract } from "ethers";
import dotenv from "dotenv";
import { getLiveAddresses } from "../live_addresses";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const liveAddresses = getLiveAddresses(await getChainId(), hre.config.networks.hardhat.forking?.enabled);
  dotenv.config({ path: (await getChainId()) == "31337" ? ".test.env" : ".env", override: true });
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { TokenLibAddr } = await getLibraries();

  const whitelistService = await ethers.getContract("WhitelistService");
  const actWlHash = await whitelistService.getWhitelistHash(deployer, "actions");
  console.log("actWlHash", actWlHash);
  try {
    await whitelistService.createWhitelist("actions");
  } catch {
    // loose test for "that that whitelist was already created"
  }

  await deployUniswapActions(
    deploy,
    deployer,
    whitelistService,
    actWlHash,
    TokenLibAddr,
    hre.config.networks.hardhat.forking?.enabled,
    liveAddresses
  );

  await deploySushiActions(
    deploy,
    deployer,
    whitelistService,
    actWlHash,
    TokenLibAddr,
    hre.config.networks.hardhat.forking?.enabled,
    liveAddresses
  );

  await deployGmxActions(
    deploy,
    deployer,
    whitelistService,
    actWlHash,
    TokenLibAddr,
    hre.config.networks.hardhat.forking?.enabled,
    liveAddresses
  );

  // TODO: deploy all the other actions

  if ((await whitelistService.getWhitelistOwner(actWlHash)) == deployer) {
    await whitelistService.transferWhitelistOwnership(actWlHash, process.env.PLATFORM_MULTI_SIG_ADDR);
  } // else was already transferred
};

async function deployUniswapActions(
  deploy: any,
  deployer: string,
  whitelistService: Contract,
  actWlHash: any,
  TokenLibAddr: string,
  forked: undefined | boolean,
  liveAddresses: any
) {
  let uniswapRouterAddr;
  let nonfungiblePositionManagerAddr;
  let weth9Addr;

  // TODO: utils to change the following to vars, depending on chainID
  if ((await getChainId()) == "31337" && !forked) {
    uniswapRouterAddr = (await ethers.getContract("TestSwapRouter")).address;
    nonfungiblePositionManagerAddr = ethers.constants.AddressZero;
    weth9Addr = (await ethers.getContract("WETH")).address;
  } else {
    uniswapRouterAddr = liveAddresses.uniswap.swap_router;
    nonfungiblePositionManagerAddr = liveAddresses.uniswap.non_fungible_position_manager;
    weth9Addr = liveAddresses.tokens.WETH;
  }

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

  await addToWhitelist(deployer, whitelistService, actWlHash, uniSwapExactInputSingle.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniSweepAndBurnLiquidityPositionAction.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniMintLiquidityPositionAction.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniCollectFeesAction.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniIncreaseLiquidityAction.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniDecreaseLiquidityAction.address);
}

async function deploySushiActions(
  deploy: any,
  deployer: string,
  whitelistService: Contract,
  actWlHash: any,
  TokenLibAddr: string,
  forked: undefined | boolean,
  liveAddresses: any
) {
  let router;
  let weth9Addr;

  // TODO: utils to change the following to vars, depending on chainID
  if ((await getChainId()) == "31337" && !forked) {
    router = (await ethers.getContract("TestSwapRouter")).address;
    weth9Addr = (await ethers.getContract("WETH")).address;
  } else {
    router = liveAddresses.sushiswap.swap_router;
    weth9Addr = liveAddresses.tokens.WETH;
  }

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

  await addToWhitelist(deployer, whitelistService, actWlHash, sushiSwapExactXForY.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, sushiAddLiquidity.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, sushiRemoveLiquidity.address);
}

async function deployGmxActions(
  deploy: any,
  deployer: string,
  whitelistService: Contract,
  actWlHash: any,
  TokenLibAddr: string,
  forked: undefined | boolean,
  liveAddresses: any
) {
  let router;
  let position_router;
  let reader;

  // Note: tests will fail against Gmx if run on unforked network
  if ((await getChainId()) == "31337" && !forked) {
    router = ethers.constants.AddressZero;
    position_router = ethers.constants.AddressZero;
    reader = ethers.constants.AddressZero;
  } else {
    router = liveAddresses.gmx.router;
    position_router = liveAddresses.gmx.position_router;
    reader = liveAddresses.gmx.reader;
  }

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

  await addToWhitelist(deployer, whitelistService, actWlHash, gmxSwap.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, gmxIncreasePosition.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, gmxDecreasePosition.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, gmxConfirmRequestExecOrCancel.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, gmxConfirmNoPosition.address);
}

export default func;
func.tags = ["Actions"];
func.dependencies = ["TestStubs", "Libraries", "WhitelistService"];
