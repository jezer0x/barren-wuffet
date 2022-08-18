import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer} = await getNamedAccounts();
  const TradeManager = await (await ethers.getContract("TradeManager")).address;

  await deploy('FundManager', {
    from: deployer,
    args: [TradeManager],
    log: true,
  });
};

export default func;
func.tags = ['FundManager'];
func.dependencies = ["TradeManager"]; 
