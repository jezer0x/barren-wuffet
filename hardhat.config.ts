import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy"; 

const config: HardhatUserConfig = {
  solidity: "0.8.9",
  namedAccounts: {
    deployer: 0,
  },
  paths: {
    sources: 'contracts',
  },
};

export default config;
