import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer} = await getNamedAccounts();
  
  const whitelistService =  await ethers.getContract("WhitelistService");
  const trigWlHash = await whitelistService.getWhitelistHash(deployer, "triggers"); 
  const actWlHash = await whitelistService.getWhitelistHash(deployer, "actions"); 

  await deploy('RuleExecutor', {
    from: deployer,
    args: [whitelistService.address, trigWlHash, actWlHash],
    log: true,
  });
};
export default func;
func.tags = ['RuleExecutor'];
