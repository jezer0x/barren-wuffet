import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import { addToWhitelist, getLibraries } from "../utils";
import { Contract } from "ethers";
import dotenv from "dotenv";
dotenv.config({ path: ".test.env" });

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
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

  await deploySwapUniSingleAction(deploy, deployer, whitelistService, actWlHash, TokenLibAddr);
  // TODO: deploy all the other actions

  if ((await whitelistService.getWhitelistOwner(actWlHash)) == deployer) {
    await whitelistService.transferWhitelistOwnership(actWlHash, process.env.PLATFORM_MULTI_SIG_ADDR);
  } // else was already transferred
};

async function deploySwapUniSingleAction(
  deploy: any,
  deployer: string,
  whitelistService: Contract,
  actWlHash: any,
  TokenLibAddr: string
) {
  let uniswapAddr;
  let weth9Addr;

  // TODO: utils to change the following to vars, depending on chainID
  if ((await getChainId()) == "31337") {
    uniswapAddr = (await ethers.getContract("TestSwapRouter")).address;
    weth9Addr = (await ethers.getContract("WETH")).address;
  } else {
    uniswapAddr = ethers.constants.AddressZero;
    weth9Addr = ethers.constants.AddressZero;
  }

  const swapUniSingleAction = await deploy("SwapUniSingleAction", {
    from: deployer,
    args: [uniswapAddr, weth9Addr],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });

  await addToWhitelist(deployer, whitelistService, actWlHash, swapUniSingleAction.address);
}

export default func;
func.tags = ["Actions"];
func.dependencies = ["TestStubs", "Libraries", "WhitelistService"];
