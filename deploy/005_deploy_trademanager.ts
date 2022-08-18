import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer} = await getNamedAccounts();
  const RuleExecutor = await (await ethers.getContract("RuleExecutor")).address;

  await deploy('TradeManager', {
    from: deployer,
    args: [RuleExecutor],
    log: true,
  });
};

export default func;
func.tags = ['TradeManager'];
func.dependencies = ["RuleExecutor"]; 
