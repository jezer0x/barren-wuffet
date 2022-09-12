import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { getLibraries } from "../utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const { TokenLibAddr } = await getLibraries();

  // This is being done for tests
  const uniswapAddr = (await ethers.getContract("TestSwapRouter")).address;
  const weth9Addr = (await ethers.getContract("WETH")).address;

  await deploy("SwapUniSingleAction", {
    from: deployer,
    args: [uniswapAddr, weth9Addr],
    log: true,
    libraries: { TokenLib: TokenLibAddr },
  });

  // TODO: deploy all the other actions
};
export default func;
func.tags = ["Actions"];
func.dependencies = ["TestStubs", "Libraries"];
