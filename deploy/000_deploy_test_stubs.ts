import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ERC20_DECIMALS, ETH_PRICE_IN_USD, TST1_PRICE_IN_USD } from "../test/Constants";
import { BigNumber } from "ethers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

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

  const startingSupply = BigNumber.from("1000000").mul(ERC20_DECIMALS);
  await deploy("TestToken1", {
    contract: "TestToken",
    from: deployer,
    args: [startingSupply, "Test1", "TST1"],
    log: true,
  });

  await deploy("TestToken2", {
    contract: "TestToken",
    from: deployer,
    args: [startingSupply, "Test2", "TST2"],
    log: true,
  });

  await deploy("WETH", {
    contract: "TestToken",
    from: deployer,
    args: [startingSupply, "WETH", "WETH"],
    log: true,
  });
};

export default func;
func.tags = ["TestStubs"];
