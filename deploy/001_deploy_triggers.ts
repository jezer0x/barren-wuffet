import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("PriceTrigger", {
    from: deployer,
    args: [],
    log: true,
  });

  // TODO: Deploy Timestamp Trigger
};

export default func;
func.tags = ["Triggers"];
