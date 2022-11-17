import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ERC20_DECIMALS, ETH_PRICE_IN_USD, TST1_PRICE_IN_USD } from "../../test/Constants";
import { BigNumber } from "ethers";
import { isForked } from "../../test/helper";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy, log } = deployments;

  const { deployer } = await getNamedAccounts();

  // we only need TestStubs when running tests
  if ((await getChainId()) == "31337" && !isForked()) {
    log("> Deploying Test Stubs");
    await deploy("TestOracleEth", {
      contract: "TestOracle",
      from: deployer,
      args: [ETH_PRICE_IN_USD],
      log: true
    });

    await deploy("TestOracleTst1", {
      contract: "TestOracle",
      from: deployer,
      args: [TST1_PRICE_IN_USD],
      log: true
    });

    const startingSupply = BigNumber.from("1000000").mul(ERC20_DECIMALS);
    await deploy("TestToken1", {
      contract: "TestToken",
      from: deployer,
      args: [startingSupply, "Test1", "TST1"],
      log: true
    });

    await deploy("TestToken2", {
      contract: "TestToken",
      from: deployer,
      args: [startingSupply, "Test2", "TST2"],
      log: true
    });

    const WETH = await deploy("WETH", {
      contract: "TestToken",
      from: deployer,
      args: [startingSupply, "WETH", "WETH"],
      log: true
    });

    await deploy("TestSwapRouter", {
      contract: "TestSwapRouter",
      from: deployer,
      args: [WETH.address],
      log: true
    });

    await deploy("TestGelatoOps", {
      contract: "TestGelatoOps",
      from: deployer,
      args: [],
      log: true
    });
    log("\n");
  }
};

export default func;
func.tags = ["TestStubs"];
