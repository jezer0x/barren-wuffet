# Development

## Basic Setup

This project is written using [Hardhat](https://hardhat.org/)

`yarn` is the package manager used. yarn-lock is included in the repo. Do `yard add package --dev` to install new packages instead of `npm install --save-dev package`.

## Testing

### Locally

`yarn hardhat test`

### Forked Mainnet

If you want to test against smart contracts that are live, you need to use an alchemy archival node (with an API key) and ask hardhat to run a local instance forked from mainnet.

Step 1: `yarn hardhat node --fork https://arb-mainnet.g.alchemy.com/v2/<API KEY> --fork-ignore-unknown-tx-type true --fork-block-number 22330560 --no-deploy`
Step 2: `yarn hardhat test --network localhost`

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

### The Graph

This section mostly follows: https://github.com/graphprotocol/hardhat-graph

- yarn add @graphprotocol/graph-cli
- yarn add @graphprotocol/graph-ts
- yarn add @graphprotocol/hardhat-graph


* from another terminal in the root folder, run `yarn hardhat node --hostname 0.0.0.0`
* deploy hardhat on localhost `yarn hardhat deploy --network localhost`
* `yarn hardhat graph init --contract-name BarrenWuffet --address 0x3Aa5ebB10DC797CAC828524e59A333d0A371443c`. (replace the address with the address from deploy)
* from root, `docker-compose up --force-recreate`
* `yarn create-local`
* `yarn deploy-local`
* Run `yarn hardhat run test/graph_manual/testGraph.ts --network localhost`
* Run `yarn hardhat run test/graph_manual/testGraph2.ts --network localhost`
* Run `yarn hardhat run test/graph_manual/testGraph3.ts --network localhost`
* go to http://localhost:8000/subgraphs/name/barren-wuffet and query with { funds }. You should see the list of funds on right hand side!

CLEANUP:

- Close the hardhat node
- `yarn graph-local-clean`
- You also need to `--force-recreate` the next time you're doing `docker-compose up`

MODIFYING:

- We'll mainly work with `./subgraph/schema.graphql` and `./subgraph/src/*.ts` files.
- When you update the schema, run `yarn graph-build` to codegen the stuff inside `generate/`.
- After this you can modify the stuff under `src/` to translate the event data to the graphql schema we defined.
- When adding new data sources, we'll be touching the `subgraph.yml` files.
