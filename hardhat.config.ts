import "@nomicfoundation/hardhat-toolbox";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";
import "solidity-coverage";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "@openzeppelin/hardhat-upgrades";
import dotenv from "dotenv";
dotenv.config();

const config = {
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: { optimizer: { enabled: true, runs: 200 } }
      }
    ]
  },
  networks: {
    ...(process.env.ALCHEMY_API_KEY_ARBI
      ? {
          hardhat: {
            forking: {
              // url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY_GOERLI}`,
              // blockNumber: 7900766,
              url: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY_ARBI}`,
              blockNumber: 38873811,
              enabled: process.env.FORKIT?.toUpperCase() === "TRUE"
            }
          }
        }
      : {}),
    ...(process.env.ALCHEMY_API_KEY_GOERLI
      ? {
          goerli: {
            //url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY_GOERLI}`,
            url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY_GOERLI}`,
            accounts: [process.env.DEPLOYER_PRIV_KEY],
            verify: {
              etherscan: {
                apiUrl: "https://api-goerli.etherscan.io/",
                apiKey: process.env.ETHERSCAN_API_KEY
              }
            }
          }
        }
      : {})
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
  mocha: { timeout: 60000 },
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
