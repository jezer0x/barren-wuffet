import { BigNumber, utils } from "ethers";

export const GT = 0;
export const LT = 1;

export const ERC20_DECIMALS = BigNumber.from(10).pow(18);
export const PRICE_TRIGGER_DECIMALS = BigNumber.from(10).pow(8);

export const ETH_PRICE_IN_USD = BigNumber.from(1300).mul(PRICE_TRIGGER_DECIMALS);
export const UNI_PRICE_IN_USD = BigNumber.from(3).mul(PRICE_TRIGGER_DECIMALS);

export const UNI_PRICE_IN_ETH_PARAM = utils.defaultAbiCoder.encode(["string", "string"], ["uni", "eth"]);
export const UNI_PRICE_IN_ETH = UNI_PRICE_IN_USD.mul(PRICE_TRIGGER_DECIMALS).div(ETH_PRICE_IN_USD); // 230769 = 1 UNI costs ~0.00230769 ETH

export const BAD_RULE_HASH = "0x" + "1234".repeat(16);

export const DEFAULT_REWARD = utils.parseEther("0.01");
