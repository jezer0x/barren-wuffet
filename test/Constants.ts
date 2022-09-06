import { BigNumber, utils, constants } from "ethers";

export const GT = 0;
export const LT = 1;

export const PRICE_TRIGGER_TYPE = 1;
export const TIMESTAMP_TRIGGER_TYPE = 2;

export const ERC20_DECIMALS = BigNumber.from(10).pow(18);
export const PRICE_TRIGGER_DECIMALS = BigNumber.from(10).pow(8);

export const ETH_PRICE_IN_USD = BigNumber.from(1300).mul(PRICE_TRIGGER_DECIMALS);
export const TST1_PRICE_IN_USD = BigNumber.from(3).mul(PRICE_TRIGGER_DECIMALS);

export const TST1_PRICE_IN_ETH = TST1_PRICE_IN_USD.mul(PRICE_TRIGGER_DECIMALS).div(ETH_PRICE_IN_USD); // 230769 = 1 TST1 costs ~0.00230769 ETH
export const ETH_PRICE_IN_TST1 = ETH_PRICE_IN_USD.mul(PRICE_TRIGGER_DECIMALS).div(TST1_PRICE_IN_USD); // 43333333333 = 1 ETH costs ~433 TST1

export const BAD_RULE_HASH = "0x" + "1234".repeat(16);
export const BAD_TRADE_HASH = "0x" + "1234".repeat(16);
export const BAD_FUND_HASH = "0x" + "1234".repeat(16);

export const DEFAULT_INCENTIVE = utils.parseEther("0.01");

export const FUND_STATUS = {
  RAISING: 0,
  DEPLOYED: 1,
  CLOSABLE: 2,
  CLOSED: 3,
};

export const TOKEN_TYPE = {
  NATIVE: 0,
  ERC721: 1,
  ERC20: 2,
};

export const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const USD_ADDRESS = constants.AddressZero;

export const ETH_TOKEN = {
  t: TOKEN_TYPE.NATIVE,
  addr: ETH_ADDRESS,
};
