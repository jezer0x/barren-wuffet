# Development

## Basic Setup

This project is written using [Hardhat](https://hardhat.org/)

`yarn` is the package manager used. yarn-lock is included in the repo. Do `yard add package --dev` to install new packages instead of `npm install --save-dev package`.

## Testing

### Locally

`yarn hardhat test`

### Forked Mainnet

If you want to test against smart contracts that are live, you need to use an alchemy archival node (with an API key) and ask hardhat to run a local instance forked from mainnet.

Step 1: Ensure your `.env` file has an api key from alchemy
Step 2: `FORKIT=TRUE yarn hardhat test <testfileName>`

## Deployment

`yarn hardhat deploy` (`--network localhost` if you're running `yarn hardhat node` in another terminal)

## Other Tools

### Coverage

To get code coverage do `npx hardhat coverage`.

The html files inside /coverage folder will tell you what's missing coverage. You can use Coverage Gutter plugin on VSCode to facilitate this.

We want 100% coverage on any smart contract code that gets deployed. If code doesn't need to be used, it should not be there. And whatever code does exist in the smart contract needs to be run by the tests.

To generate the coverage badge, run `yarn run istanbul-badges-readme` after running coverage. It generates the badge from `coverage/coverage-summary.json`

### Slither - Security Analyzer

`pip3 install slither-analyzer`
`slither .` inside the repo.

Run it after major changes and ensure there arent any warnings / errors.

To disable slither, you can add // slither-disable-next-line <rule>

### Surya - GraphViz for Architecture

Install Surya using : `npm install -g surya`

To create a graphviz summary of all the function calls do, `surya graph contracts/**/*.sol > FM_full.dot` and open FM_full.dot using a graphviz plugin on VSCode.

`surya describe contracts/**/*.sol` will summarize the contracts and point out fn modifiers / payments. It's useful to get an overview.

You can see further instructons for Surya at https://github.com/ConsenSys/surya.
