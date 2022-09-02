Branch Coverage: ![Branches](https://img.shields.io/badge/branches-61.39%25-red.svg?style=flat)

# Olympus Mons

Olympus Mons is a decentralized fund management platform that allows you to deposit funds into the contract, and tag it to a specific fund manager who can manage your funds on-chain.

The Fund Manager / Trade Manager and Rule Executor contracts are intended to function independently, and can be used by other projects / users if required.

## Fund Manager

This contract allows any fund manager to create funds, accept deposits into the fund. They can trigger trades from the funds by subscribing to DegenStreet Trades (IFTTT), or take synchronous Actions.

## Trade Manager

Trades are created by sending a set of Triggers, Actions along with constraints into DegenStreet. The Trigger -> Action pair is called a "Rule". DegenStreet uses the Rule Executor to set up the Rules, but they are initially deactivated.

After a trade is created, collateral can be deposited into the trade.

Constraints are trade-level restrictions (like min-collateral) that the DegenStreet will use to decide when to accept deposits, when to activate the Rules, and when to allow withdrawal of the deposits.

## Rule Executor

Rule executor is like IFTTT. It accepts Triggers and Actions (ie. Rules) and allows anyone (typically bots) to call the contract to execute action on behalf of the user if a certain trigger is met. They can get a reward if the action does get executed successfully.

Triggers will typically include oracle feeds and must follow the ITrigger interface.
Actions will include defi transactions (swaps, buying options) and must follow the IAction interface.
Both will have a whitelist both in terms of contracts that can be called and the specific actions that can be performed on this contracts to reduce the surface area of attacks.

The eventual goal is to allow anyone to add new triggers (without being able to modify existing triggers) by creating contracts that use ITrigger / IAction interface.

## Development

This project is written using [Hardhat](https://hardhat.org/)

`yarn` is the package manager used. yarn-lock is included in the repo. Do `yard add package --dev` to install new packages instead of `npm install --save-dev package`.

### Testing

`yarn hardhat test`

To get code coverage do `npx hardhat coverage`.

The html files inside /coverage folder will tell you what's missing coverage. You can use Coverage Gutter plugin on VSCode to facilitate this.

We want 100% coverage on any smart contract code that gets deployed. If code doesn't need to be used, it should not be there. And whatever code does exist in the smart contract needs to be run by the tests.

To generate the coverage badge, run `yarn run istanbul-badges-readme` after running coverage. It generates the badge from `coverage/coverage-summary.json`

### Testing on Forked Local Node

If you want to test against smart contracts that are live, you need to use an alchemy archival node (with an API key) and ask hardhat to run a local instance forked from mainnet.

Step 1: `yarn hardhat node --fork https://arb-mainnet.g.alchemy.com/v2/<API KEY> --fork-ignore-unknown-tx-type true --fork-block-number 22330560 --no-deploy`
Step 2: `yarn hardhat test --network localhost`

### Deploying

`yarn hardhat deploy` (`--network localhost` if you're running `yarn hardhat node` in another terminal)

## Dev tools

### Surya - GraphViz for Architecture

Install Surya using : `npm install -g surya`

To create a graphviz summary of all the function calls do, `surya graph contracts/**/*.sol > FM_full.dot` and open FM_full.dot using a graphviz plugin on VSCode.

`surya describe contracts/**/*.sol` will summarize the contracts and point out fn modifiers / payments. It's useful to get an overview.

You can see further instructons for Surya at https://github.com/ConsenSys/surya.

### Slither - Security Analyzer

`pip3 install slither-analyzer`
`slither .` inside the repo.

Run it after major changes and ensure there arent any warnings / errors.

To disable slither, you can add // slither-disable-next-line <rule>
