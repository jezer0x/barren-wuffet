import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const fundImpl = await ethers.getContract("Fund");

  await deploy("FundBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [fundImpl.address],
    log: true
  });
};

export default func;
func.tags = ["FundBeacon"];
func.dependencies = ["Fund"];
