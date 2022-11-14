import { makeDefaultSubConstraints } from "../Fixtures";
import { ETH_TOKEN, TOKEN_TYPE, DEFAULT_SUB_TO_MAN_FEE_PCT } from "../Constants";
import { getAddressFromEvent } from "../helper";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber } from "ethers";
import { getProtocolAddresses } from "../../deploy/protocol_addresses";
import { IERC20Metadata__factory } from "../../typechain-types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export async function setupEnvForActionTests(ethers: HardhatRuntimeEnvironment["ethers"]) {
  const protocolAddresses: any = await getProtocolAddresses("31337", true);
  const BW = await ethers.getContract("BarrenWuffet");
  const dai_contract = new Contract(protocolAddresses.tokens.DAI, IERC20Metadata__factory.abi, ethers.provider);
  const DAI_TOKEN = { t: TOKEN_TYPE.ERC20, addr: protocolAddresses.tokens.DAI, id: BigNumber.from(0) };

  const McFundAddr = await getAddressFromEvent(
    BW.createFund("marlieChungerFund", await makeDefaultSubConstraints(), DEFAULT_SUB_TO_MAN_FEE_PCT, []),
    "Created",
    BW.address,
    1
  );

  const McFund: Contract = await ethers.getContractAt("Fund", McFundAddr);
  const McFundRobocop: Contract = await ethers.getContractAt("RoboCop", await McFund.robocop());

  await McFund.deposit(ETH_TOKEN, ethers.utils.parseEther("21"), {
    value: ethers.utils.parseEther("21")
  });

  // increase to beyond deadline so we can start taking actions
  await time.increaseTo((await time.latest()) + 86400);

  return {
    protocolAddresses,
    DAI_TOKEN,
    dai_contract,
    McFund,
    McFundRobocop
  };
}

export async function setupEnvForSushiTests({ ethers }: HardhatRuntimeEnvironment) {
  const sushiSwapExactXForY = await ethers.getContract("SushiSwapExactXForY");
  const sushiAddLiquidity = await ethers.getContract("SushiAddLiquidity");
  const { protocolAddresses, DAI_TOKEN, dai_contract, McFund, McFundRobocop } = await setupEnvForActionTests(ethers);
  return {
    sushiSwapExactXForY,
    sushiAddLiquidity,
    protocolAddresses,
    DAI_TOKEN,
    dai_contract,
    McFund,
    McFundRobocop
  };
}
