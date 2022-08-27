import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ETH_ADDRESS } from "../test/Constants";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const uniswapAddr = ETH_ADDRESS; // TODO: fill in with proper addr
  const weth9Addr = ETH_ADDRESS; // TODO: fill in with proper addr

  await deploy("SwapUniSingleAction", {
    from: deployer,
    args: [uniswapAddr, weth9Addr],
    log: true,
  });

  // TODO: deploy all the other actions
};
export default func;
func.tags = ["Actions"];
