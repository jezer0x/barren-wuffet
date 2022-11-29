import { BigNumber as BN } from "ethers";
import { parseUnits } from "ethers/lib/utils";

export const PRICE_DECIMALS = 18;

export const pow = (decimals: number) => BN.from(10).pow(decimals);

export function invertPrice(price: BN) {
  return divPrice(parseUnits("1", PRICE_DECIMALS), price);
}

export function mulPrice(tokenAmount: BN, price: BN) {
  return tokenAmount.mul(price).div(pow(PRICE_DECIMALS));
}

export function divPrice(tokenValue: BN, price: BN) {
  return tokenValue.mul(pow(PRICE_DECIMALS)).div(price);
}

export function getRelativePrice(token1Amount: BN, token1Decimals: number, token2Amount: BN, token2Decimals: number) {
  const relativeDecimals = token1Decimals - token2Decimals;
  const _step1 = token1Amount.mul(pow(PRICE_DECIMALS));

  const _step2 = relativeDecimals > 0 ? _step1.div(pow(relativeDecimals)) : _step1.mul(pow(-relativeDecimals));

  return _step2.div(token2Amount);
}

export function percentOf(amount: BN, basisPoints: BN): BN {
  return amount.mul(basisPoints).div(100);
}
