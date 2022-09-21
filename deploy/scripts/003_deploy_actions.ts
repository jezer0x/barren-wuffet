import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { getLibraries } from "../utils";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { TokenLibAddr } = await getLibraries();

  // This is being done for tests
  const uniswapAddr = (await ethers.getContract("TestSwapRouter")).address;
  const weth9Addr = (await ethers.getContract("WETH")).address;

  const whitelistService = await ethers.getContract("WhitelistService");
  const actWlHash = await whitelistService.getWhitelistHash(deployer, "actions");
  try {
    await whitelistService.createWhitelist("actions");
  } catch {
    // loose test for "that that whitelist was already created"
  }

  const swapUniSingleAction = await deploy("SwapUniSingleAction", {
    from: deployer,
    args: [uniswapAddr, weth9Addr],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  await whitelistService.addToWhitelist(actWlHash, swapUniSingleAction.address);

  // TODO: deploy all the other actions
};

export default func;
func.tags = ["Actions"];
func.dependencies = ["TestStubs", "Libraries", "WhitelistService"];
