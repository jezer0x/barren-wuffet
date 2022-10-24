import "@nomicfoundation/hardhat-toolbox";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";
import "solidity-coverage";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "@graphprotocol/hardhat-graph";
import "@openzeppelin/hardhat-upgrades";
import dotenv from "dotenv";
dotenv.config();

const config = {
  solidity: {
    compilers: [
      {
        version: "0.8.9",
        settings: { optimizer: { enabled: true, runs: 200 } }
      }
    ]
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY_ARBI}`,
        blockNumber: 20005467, // using a pre-nitro block
        enabled: false
      }
    },
    goerli: {
      url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY_GOERLI}`,
      accounts: [process.env.DEPLOYER_PRIV_KEY],
      verify: {
        etherscan: {
          apiUrl: "https://api-goerli.etherscan.io/",
          apiKey: process.env.ETHERSCAN_API_KEY
        }
      }
    }
  },
  namedAccounts: {
    deployer: 0,
    marlieChunger: 1,
    fairyLink: 2,
    bot: 3,
    fundSubscriber: 4,
    fundSubscriber2: 5,
    ruleMaker: 6
  },
  paths: {
    sources: "contracts",
    deploy: "deploy/scripts"
  },
  gasReporter: {
    enabled: false
  },
  external: {
    contracts: [
      {
        artifacts: "node_modules/@openzeppelin/contracts/build/contracts"
      }
    ]
  }
};

export default config;
