import { makeDefaultSubConstraints } from "../Fixtures";
import { ETH_TOKEN, TOKEN_TYPE, DEFAULT_SUB_TO_MAN_FEE_PCT } from "../Constants";
import { getAddressFromEvent } from "../helper";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber } from "ethers";
import { getProtocolAddresses } from "../../deploy/protocol_addresses";
import { IERC20Metadata__factory } from "../../typechain-types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { abi as GMX_READER_ABI } from "./gmx/GmxReader.json";
import { abi as GMX_ROUTER_ABI } from "./gmx/GmxRouter.json";
import { abi as GMX_POSITION_ROUTER_ABI } from "./gmx/GmxPositionRouter.json";
import { abi as GMX_VAULT_ABI } from "./gmx/GmxVault.json";

export async function setupEnvForActionTests(ethers: HardhatRuntimeEnvironment["ethers"]) {
  const protocolAddresses: any = await getProtocolAddresses("31337");
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
  const McFundRoboCop: Contract = await ethers.getContractAt("RoboCop", await McFund.roboCop());

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
    McFundRoboCop
  };
}

export async function setupEnvForSushiTests({ ethers }: HardhatRuntimeEnvironment) {
  const sushiSwapExactXForY = await ethers.getContract("SushiSwapExactXForY");
  const sushiAddLiquidity = await ethers.getContract("SushiAddLiquidity");
  const sushiRemoveLiquidity = await ethers.getContract("SushiRemoveLiquidity");

  return {
    sushiSwapExactXForY,
    sushiAddLiquidity,
    sushiRemoveLiquidity,
    ...(await setupEnvForActionTests(ethers))
  };
}

export async function setupEnvForUniTests({ ethers }: HardhatRuntimeEnvironment) {
  const swapUniAction = await ethers.getContract("UniSwapExactInputSingle");
  const mintLPAction = await ethers.getContract("UniMintLiquidityPosition");
  return {
    swapUniAction,
    mintLPAction,
    ...(await setupEnvForActionTests(ethers))
  };
}

export async function setupEnvForGmxTests({ ethers }: HardhatRuntimeEnvironment) {
  const setupEnvRes = await setupEnvForActionTests(ethers);

  const swapGmxAction = await ethers.getContract("GmxSwap");
  const increasePositionGmxAction = await ethers.getContract("GmxIncreasePosition");
  const decreasePositionGmxAction = await ethers.getContract("GmxDecreasePosition");
  const confirmReqExecOrCancelGmxAction = await ethers.getContract("GmxConfirmRequestExecOrCancel");
  const confirmNoPositionGmxActions = await ethers.getContract("GmxConfirmNoPosition");

  const gmxReader = new Contract(setupEnvRes.protocolAddresses.gmx.reader, GMX_READER_ABI, ethers.provider);
  const gmxRouter = new Contract(setupEnvRes.protocolAddresses.gmx.router, GMX_ROUTER_ABI, ethers.provider);
  const gmxPositionRouter = new Contract(
    setupEnvRes.protocolAddresses.gmx.position_router,
    GMX_POSITION_ROUTER_ABI,
    ethers.provider
  );
  const gmxVault = new Contract(await gmxRouter.vault(), GMX_VAULT_ABI, ethers.provider);

  return {
    swapGmxAction,
    increasePositionGmxAction,
    decreasePositionGmxAction,
    confirmReqExecOrCancelGmxAction,
    confirmNoPositionGmxActions,
    gmxReader,
    gmxRouter,
    gmxVault,
    gmxPositionRouter,
    ...setupEnvRes
  };
}
