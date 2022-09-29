import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import { addToWhitelist, getLibraries } from "../utils";
import { Contract } from "ethers";
import dotenv from "dotenv";
import * as liveAddresses from "../arbitrum_addresses";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
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
    hre.config.networks.hardhat.forking?.enabled
  );

  await deploySushiSwapExactXToY(
    deploy,
    deployer,
    whitelistService,
    actWlHash,
    TokenLibAddr,
    hre.config.networks.hardhat.forking?.enabled
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
  forked: undefined | boolean
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

  const UniBurnLiquidityPositionAction = await deploy("UniBurnLiquidityPosition", {
    from: deployer,
    args: [nonfungiblePositionManagerAddr, weth9Addr],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  const UniMintLiquidityPositionAction = await deploy("UniMintLiquidityPosition", {
    from: deployer,
    args: [nonfungiblePositionManagerAddr, weth9Addr, UniBurnLiquidityPositionAction.address],
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
  await addToWhitelist(deployer, whitelistService, actWlHash, UniBurnLiquidityPositionAction.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniMintLiquidityPositionAction.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniCollectFeesAction.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniIncreaseLiquidityAction.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, UniDecreaseLiquidityAction.address);
}

async function deploySushiSwapExactXToY(
  deploy: any,
  deployer: string,
  whitelistService: Contract,
  actWlHash: any,
  TokenLibAddr: string,
  forked: undefined | boolean
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

  await addToWhitelist(deployer, whitelistService, actWlHash, sushiSwapExactXForY.address);
}

export default func;
func.tags = ["Actions"];
func.dependencies = ["TestStubs", "Libraries", "WhitelistService"];
