import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer} = await getNamedAccounts();

const uniswapAddr = ethers.constants.AddressZero; // TODO: fill in with proper addr
const weth9Addr = ethers.constants.AddressZero;   // TODO: fill in with proper addr
  
  await deploy('SwapUniSingleAction', {
    from: deployer,
    args: [uniswapAddr, weth9Addr],
    log: true,
  });
};
export default func;
func.tags = ['SwapUniSingleAction'];
