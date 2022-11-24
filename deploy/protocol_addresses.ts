import { ethers } from "hardhat";
import { isForked } from "../test/helper";

const arbitrum = {
  tokens: {
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    USDC: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    GMX: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a"
  },

  // https://docs.gelato.network/developer-products/gelato-ops-smart-contract-automation-hub/contract-addresses#arbitrum
  gelato: {
    treasury: "0xB2f34fd4C16e656163dADFeEaE4Ae0c1F13b140A",
    ops: "0xB3f5503f93d5Ef84b06993a1975B9D21B962892F"
  },

  // https://docs.chain.link/docs/arbitrum-price-feeds/
  // TODO

  // https://docs.uniswap.org/protocol/reference/deployments
  uniswap: {
    swap_router: "0xe592427a0aece92de3edee1f18e0157c05861564",
    non_fungible_position_manager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984"
  },

  sushiswap: {
    swap_router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506"
  },

  // https://docs.dopex.io/contracts/arbitrum
  dopex: {
    DpxMonthlyCallsSsovV3: "0x1ae38835Bf3afbEC178E8a59Ca82aA383dC3DF57",
    RdpxMonthlyCallsSsovV3: "0xAfD90Af84ae892C2DFeEA6D379087A7B4D21eC34",
    EthMonthlyCallsSsovV3: "0x8161033b2776a9556b326D5eB468B2B76B7B4a23",
    GohmMonthlyCallsSsovV3: "0x52c70138FfF1a5a6D821ab4Bb39D3dF0346f98bd",
    DpxWeeklyPutsSsovV3: "0xE9132A503ba31Cf6320Ae97f42A9f3cf06Fa4e08",
    RdpxWeeklyPutsSsovV3: "0xdbAfE8d85620c2cfCc0b2a55d5d68D48B1d00631",
    BtcWeeklyPutsSsovV3: "0x54565213927794D7cA31436D01b799f487e204BA",
    EthWeeklyPutsSsovV3: "0xC7552Cd237823DeFa7F3a2E2cB6A3D0B9759F32C",
    GohmWeeklyPutsSsovV3: "0x541fDD2284852Dacc5BA7E31241Ff5bc646b8985",
    GmxWeeklyPutsSsovV3: "0x7e513B848cFAF3Bc9FfB69a35981E5E1279acE59",
    CrvWeeklyPutsSsovV3: "0x03475494dc89d378C4268e90A62876eFb0278a1a"
  },

  // https://curve.readthedocs.io/ref-addresses.html
  curve: {
    address_provider: "0x0000000022d53366457f9d5e68ec105046fc4383"
  },

  // https://gmxio.gitbook.io/gmx/contracts
  gmx: {
    router: "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064",
    position_router: "0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868",
    reader: "0x22199a49A999c351eF7927602CFB187ec3cae489"
  }
};

const goerli = {
  tokens: {
    WETH: "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6", // <- sushi, uni
    USDC: "0xde637d4c445ca2aae8f782ffac8d2971b93a4998", // or? uni: 0x07865c6E87B9F70255377e024ace6630C1Eaa37F //sushi: 0xd87ba7a50b2e7e660f678a895e4b72e7cb4ccd9c
    DAI: "0xdc31ee1784292379fbb2964b3b9c4124d8f89c60"
  },

  // https://docs.gelato.network/developer-products/gelato-ops-smart-contract-automation-hub/contract-addresses#arbitrum
  gelato: {
    treasury: "0xF381dfd7a139caaB83c26140e5595C0b85DDadCd",
    ops: "0xc1C6805B857Bef1f412519C4A842522431aFed39"
  },

  // https://docs.uniswap.org/protocol/reference/deployments
  uniswap: {
    swap_router: "0xe592427a0aece92de3edee1f18e0157c05861564",
    non_fungible_position_manager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984"
  },

  sushiswap: {
    swap_router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506"
  }
};

export async function getProtocolAddresses(chainID: string) {
  if (chainID == "31337" && isForked()) {
    return arbitrum; // we'll be always forking mainnet arbitrum
  } else if (chainID == "31337" && !isForked()) {
    return await getLocalNetworkAddressesForTests(); // running tests mayhaps
  } else if (chainID == "42161") {
    return arbitrum;
  } else if (chainID == "5") {
    return goerli;
  }
}

async function getLocalNetworkAddressesForTests() {
  return {
    tokens: {
      WETH: (await ethers.getContract("WETH")).address
    },
    uniswap: {
      non_fungible_position_manager: ethers.constants.AddressZero,
      swap_router: (await ethers.getContract("TestSwapRouter")).address
    },
    sushiswap: {
      swap_router: (await ethers.getContract("TestSwapRouter")).address
    },
    gmx: {
      router: ethers.constants.AddressZero,
      position_router: ethers.constants.AddressZero,
      reader: ethers.constants.AddressZero
    },
    gelato: {
      ops: (await ethers.getContract("TestGelatoOps")).address,
      treasury: ethers.constants.AddressZero
    }
  };
}
