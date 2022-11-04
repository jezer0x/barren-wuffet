import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import { addToWhitelist, getLibraries } from "../utils";
import { Contract } from "ethers";
import dotenv from "dotenv";
import { getProtocolAddresses } from "../protocol_addresses";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const protocolAddresses = await getProtocolAddresses(
    await getChainId(),
    hre.config.networks.hardhat.forking?.enabled
  );
  dotenv.config({ path: (await getChainId()) == "31337" ? ".test.env" : ".env", override: true });
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { TokenLibAddr } = await getLibraries();

  const whitelistService = await ethers.getContract("WhitelistService");
  const actWlHash = await whitelistService.getWhitelistHash(deployer, "actions");

  console.log("> Deploying Actions ");

  if (!(await whitelistService.whitelistExists(actWlHash))) {
    await whitelistService.createWhitelist("actions");
    console.log("actions whitelist created as ", whitelistService.address, "::", actWlHash);
  } else {
    console.log("triggers whitelist already exists as ", whitelistService.address, "::", actWlHash);
  }

  //await deployUniswapActions(deploy, deployer, whitelistService, actWlHash, TokenLibAddr, protocolAddresses);

  await deploySushiActions(deploy, deployer, whitelistService, actWlHash, TokenLibAddr, protocolAddresses);

  //await deployGmxActions(deploy, deployer, whitelistService, actWlHash, TokenLibAddr, protocolAddresses);

  if ((await whitelistService.getWhitelistOwner(actWlHash)) == deployer) {
    await whitelistService.transferWhitelistOwnership(actWlHash, process.env.PLATFORM_MULTI_SIG_ADDR);
    console.log(actWlHash, " ownership transferred to ", process.env.PLATFORM_MULTI_SIG_ADDR);
  } else {
    console.error("The Action Whitelist is already owned by ", await whitelistService.getWhitelistOwner(actWlHash));
  }

  console.log("\n");
};

async function deployUniswapActions(
  deploy: any,
  deployer: string,
  whitelistService: Contract,
  actWlHash: any,
  TokenLibAddr: string,
  protocolAddresses: any
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
  protocolAddresses: any
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
  protocolAddresses: any
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

  await addToWhitelist(deployer, whitelistService, actWlHash, gmxSwap.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, gmxIncreasePosition.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, gmxDecreasePosition.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, gmxConfirmRequestExecOrCancel.address);
  await addToWhitelist(deployer, whitelistService, actWlHash, gmxConfirmNoPosition.address);
}

export default func;
func.tags = ["Actions"];
func.dependencies = ["TestStubs", "Libraries", "WhitelistService"];
