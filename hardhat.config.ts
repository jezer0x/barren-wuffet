import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";
import "solidity-coverage";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.9",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
    ],
  },
  namedAccounts: {
    deployer: 0,
    marlieChunger: 1,
    fairyLink: 2,
    bot: 3,
    fundSubscriber: 4,
    fundSubscriber2: 5,
    ruleMaker: 6,
  },
  paths: {
    sources: "contracts",
  },
  gasReporter: {
    enabled: false,
  },
};

export default config;
