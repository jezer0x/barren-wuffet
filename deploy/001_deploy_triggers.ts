import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ERC20_DECIMALS, ETH_PRICE_IN_USD, TST1_PRICE_IN_USD } from "../test/Constants";
import { BigNumber } from "ethers";

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
