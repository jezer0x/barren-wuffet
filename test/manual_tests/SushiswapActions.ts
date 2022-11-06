import { ethers, getNamedAccounts } from "hardhat";
import { impersonateAccount, time } from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber, utils, Signer } from "ethers";
import {
  GT,
  ERC20_DECIMALS,
  DEFAULT_SUB_TO_MAN_FEE_PCT,
  ETH_TOKEN,
  TOKEN_TYPE,
  TIMESTAMP_TRIGGER_TYPE,
  ETH_ADDRESS
} from "../Constants";
import { getAddressFromEvent, getHashFromEvent } from "../helper";
import { getProtocolAddresses } from "../../deploy/protocol_addresses";
import { IOps__factory } from "../../typechain-types";

async function makeSubConstraints() {
  const latestTime = await time.latest();
  return {
    minCollateralPerSub: BigNumber.from(10).mul(ERC20_DECIMALS),
    maxCollateralPerSub: BigNumber.from(100).mul(ERC20_DECIMALS),
    minCollateralTotal: BigNumber.from(10).mul(ERC20_DECIMALS),
    maxCollateralTotal: BigNumber.from(500).mul(ERC20_DECIMALS),
    deadline: latestTime + 86400,
    lockin: latestTime + 86400 * 10,
    allowedDepositToken: ETH_TOKEN,
    onlyWhitelistedInvestors: false
  };
}

async function main() {
  const { deployer } = await getNamedAccounts();
  const protocolAddresses: any = await getProtocolAddresses("31337", true);
  const BW = await ethers.getContract("BarrenWuffet");

  // const multisigAddr = (await BW.feeParams())[0];
  // await impersonateAccount(multisigAddr);
  // const platformMultiSig = await ethers.getSigner(multisigAddr);

  // const deployerSigner = await ethers.getSigner(deployer);
  // deployerSigner.sendTransaction({ to: multisigAddr, value: ethers.utils.parseEther("10") });

  const McFundAddr = await getAddressFromEvent(
    BW.createFund("marlieChungerFund", await makeSubConstraints(), DEFAULT_SUB_TO_MAN_FEE_PCT, []),
    "Created",
    BW.address,
    1
  );

  const McFund = await ethers.getContractAt("Fund", McFundAddr);
  const McFundRoboCop = await ethers.getContractAt("RoboCop", await McFund.roboCop());
  await McFund.deposit(ETH_TOKEN, BigNumber.from(11).mul(ERC20_DECIMALS), {
    value: BigNumber.from(11).mul(ERC20_DECIMALS)
  });

  console.log("here");

  // increase to beyond deadline so we can start taking actions
  await time.increaseTo((await time.latest()) + 86400);
  const erc20abifrag = [
    {
      constant: true,
      inputs: [
        {
          name: "_owner",
          type: "address"
        }
      ],
      name: "balanceOf",
      outputs: [
        {
          name: "balance",
          type: "uint256"
        }
      ],
      payable: false,
      type: "function"
    }
  ];

  const dai_contract = new Contract(protocolAddresses.tokens.DAI, erc20abifrag, ethers.provider);
  const DAI_TOKEN = { t: TOKEN_TYPE.ERC20, addr: protocolAddresses.tokens.DAI, id: BigNumber.from(0) };

  const trueTrigger = {
    createTimeParams: utils.defaultAbiCoder.encode(["uint8", "uint256"], [GT, (await time.latest()) - 1]),
    triggerType: TIMESTAMP_TRIGGER_TYPE,
    callee: (await ethers.getContract("TimestampTrigger")).address
  };

  const sushiSwapExactXForY = await ethers.getContract("SushiSwapExactXForY");

  // Case 1: Sell ETH for DAI
  const ruleHash = await getHashFromEvent(
    McFund.createRule(
      [trueTrigger],
      [
        {
          callee: sushiSwapExactXForY.address,
          data: ethers.utils.defaultAbiCoder.encode(
            ["address[]", "uint256"],
            [
              [protocolAddresses.tokens.WETH, protocolAddresses.tokens.DAI],
              BigNumber.from(19).mul(BigNumber.from(10).pow(8)) // translates to ~1900USD/ETH [1900000000e18/1e18]
            ]
          ),
          inputTokens: [ETH_TOKEN], // eth
          outputTokens: [DAI_TOKEN] // swapping for DAI
        }
      ]
    ),
    "Created",
    McFundRoboCop,
    "ruleHash"
  );

  await McFund.addRuleCollateral(ruleHash, [BigNumber.from(2).mul(ERC20_DECIMALS)], [BigNumber.from(0)]); // 0 fees set in deploy
  await McFund.activateRule(ruleHash);

  // botFrontend must fund the treasury, else bot won't exec
  const botFrontend = await ethers.getContract("BotFrontend");
  await botFrontend.deposit(ethers.utils.parseEther("0.1"), { value: ethers.utils.parseEther("0.1") });

  const [canExec, execData] = await botFrontend.checker(McFundRoboCop.address, ruleHash);

  if (!canExec) {
    throw "Something went wrong! canExec was false";
  }

  const gelatoOps = new Contract(protocolAddresses.gelato.ops, IOps__factory.abi, ethers.provider);

  // impersonate gelato bot and do the bot's work
  const gelatoBotAddr = await gelatoOps.gelato();
  await impersonateAccount(gelatoBotAddr);
  const gelatoBot = await ethers.getSigner(gelatoBotAddr);

  await gelatoOps.connect(gelatoBot).exec(
    botFrontend.address,
    botFrontend.address,
    execData,
    {
      modules: [0],
      args: [
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            botFrontend.address,
            botFrontend.interface.encodeFunctionData("checker(address,bytes32)", [McFundRoboCop.address, ruleHash])
          ]
        )
      ]
    },
    ethers.utils.parseEther("0.01"),
    ETH_ADDRESS,
    true,
    false
  );

  await McFund.redeemRuleOutputs();

  console.log("here");

  var balance_dai = await dai_contract.balanceOf(McFundAddr);
  console.log("DAI balance after selling 2 ETH:", balance_dai.toString());

  // Case 2: Swap ERC20 to ETH
  let prevEthBalance = await ethers.provider.getBalance(McFundAddr);
  await McFund.takeAction(
    trueTrigger,
    {
      callee: sushiSwapExactXForY.address,
      data: ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint256"],
        [
          [protocolAddresses.tokens.DAI, protocolAddresses.tokens.WETH],
          BigNumber.from(500).mul(BigNumber.from(10).pow(24)) // translates to ~2000USD/ETH [1e18*1e18 / 1900000000]
        ]
      ),
      inputTokens: [DAI_TOKEN],
      outputTokens: [ETH_TOKEN]
    },
    [(await dai_contract.balanceOf(McFundAddr)).div(2)],
    [BigNumber.from(0)] // 0 fees set in deploy
  );
  let postEthBalance = await ethers.provider.getBalance(McFundAddr);
  console.log(
    "Ether received after selling half the DAI: ",
    ethers.utils.formatEther(postEthBalance.sub(prevEthBalance))
  );
  balance_dai = await dai_contract.balanceOf(McFundAddr);

  // Case 3: path is wrong
  try {
    await McFund.takeAction(
      trueTrigger,
      {
        callee: sushiSwapExactXForY.address,
        data: ethers.utils.defaultAbiCoder.encode(
          ["address[]", "uint256"],
          [[protocolAddresses.tokens.WETH, protocolAddresses.tokens.WETH], 0]
        ),
        inputTokens: [ETH_TOKEN], // eth
        outputTokens: [DAI_TOKEN] // swapping for DAI
      },
      [BigNumber.from(1).mul(ERC20_DECIMALS)],
      [BigNumber.from(0)] // 0 fees set in deploy
    );
  } catch (e) {
    console.log("Wrong _path send during swap doesn't work");
  }

  // balance_dai = await dai_contract.balanceOf(McFundAddr);
  // console.log("DAI balance after selling 1 more ETH:", balance_dai.toString());

  // Case 4: add LP
  const sushiAddLiquidity = await ethers.getContract("SushiAddLiquidity");

  const dai_weth_slp_contract = new Contract(
    "0x905dfCD5649217c42684f23958568e533C711Aa3",
    erc20abifrag,
    ethers.provider
  );

  const DAI_WETH_SLP_TOKEN = {
    t: TOKEN_TYPE.ERC20,
    addr: dai_weth_slp_contract.address,
    id: BigNumber.from(0)
  };

  console.log("dai_eth_slp_contract.address = ", dai_weth_slp_contract.address);

  await McFund.takeAction(
    trueTrigger,
    {
      callee: sushiAddLiquidity.address,
      data: "0x",
      inputTokens: [DAI_TOKEN, ETH_TOKEN],
      outputTokens: [DAI_TOKEN, ETH_TOKEN, DAI_WETH_SLP_TOKEN]
    },
    [balance_dai, BigNumber.from(1).mul(ERC20_DECIMALS)],
    [BigNumber.from(0), BigNumber.from(0)] // 0 fees set in deploy
  );

  console.log("WETH-DAI-SLP received after LP: ", (await dai_weth_slp_contract.balanceOf(McFundAddr)).toString());

  // Case 5: subscribers get back the SLP token if funds are closed -> no position stuff required
  await McFund.closeFund(); // trader closes fund prematurely
  await McFund.withdraw(); // trader was subscriber himself

  console.log(
    "SLP Token balance after withdraw on closed fund: ",
    (await dai_weth_slp_contract.balanceOf(deployer)).toString()
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
