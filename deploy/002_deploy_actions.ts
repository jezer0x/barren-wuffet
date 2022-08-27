import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ETH_ADDRESS } from "../test/Constants";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  // This is being done for tests
  const uniswapAddr = (await ethers.getContract("TestSwapRouter")).address;
  const weth9Addr = (await ethers.getContract("WETH")).address;

  await deploy("SwapUniSingleAction", {
    from: deployer,
    args: [uniswapAddr, weth9Addr],
    log: true,
  });

  // TODO: deploy all the other actions
};
export default func;
func.tags = ["Actions"];
