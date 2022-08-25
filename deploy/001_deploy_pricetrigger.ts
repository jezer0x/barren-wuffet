import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ETH_PRICE_IN_USD, TST1_PRICE_IN_USD } from "../test/Constants";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("PriceTrigger", {
    from: deployer,
    args: [],
    log: true,
  });

  await deploy("TestOracleEth", {
    contract: "TestOracle",
    from: deployer,
    args: [ETH_PRICE_IN_USD],
    log: true,
  });

  await deploy("TestOracleTst1", {
    contract: "TestOracle",
    from: deployer,
    args: [TST1_PRICE_IN_USD],
    log: true,
  });
};
export default func;
func.tags = ["PriceTrigger"];
