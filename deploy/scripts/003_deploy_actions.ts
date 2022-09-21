import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { getLibraries } from "../utils";
import { Contract } from "ethers";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { TokenLibAddr } = await getLibraries();

  const whitelistService = await ethers.getContract("WhitelistService");
  const actWlHash = await whitelistService.getWhitelistHash(deployer, "actions");
  try {
    await whitelistService.createWhitelist("actions");
  } catch {
    // loose test for "that that whitelist was already created"
  }

  await deploySwapUniSingleAction(deploy, deployer, whitelistService, actWlHash, TokenLibAddr);
  // TODO: deploy all the other actions
};

async function deploySwapUniSingleAction(
  deploy: any,
  deployer: string,
  whitelistService: Contract,
  actWlHash: any,
  TokenLibAddr: string
) {
  // TODO: utils to change the following to vars, depending on chainID
  const uniswapAddr = (await ethers.getContract("TestSwapRouter")).address;
  const weth9Addr = (await ethers.getContract("WETH")).address;

  const swapUniSingleAction = await deploy("SwapUniSingleAction", {
    from: deployer,
    args: [uniswapAddr, weth9Addr],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  if (!(await whitelistService.isWhitelisted(actWlHash, swapUniSingleAction.address))) {
    await whitelistService.addToWhitelist(actWlHash, swapUniSingleAction.address);
  }
}

export default func;
func.tags = ["Actions"];
func.dependencies = ["TestStubs", "Libraries", "WhitelistService"];
