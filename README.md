# Olympus Mons

Olympus Mons is a decentralized fund manager, that allows you to deposit funds into the contract and attach it to a specific fund manager who then manages your funds on-chain.


## Rule Executor

Rule executor is like IFTTT. It accepts Triggers and Actions, and user accounts that subscribe to a set of trigger -> action. It allows bots to call the contract to execute action on behalf of the user, if a certain trigger is met and get a reward if the action does get executed.

Triggers will typically include oracle feeds. 
Actions will include defi transactions (swaps, buying options).
Both will have a whitelist both in terms of contracts that can be called and the specific actions that can be performed on this contracts to reduce the surface area of attacks.

The eventual goal is to provide some flexibility for authorised persons to add new triggers (without being able to modify existing triggers) to enhance the functionality of the contract without editing the contract itself. 

It's unclear if this can be done safely on the main contract itself, or if we need to resort to using sub-contracts that serve as interfaces to specific protocols.


## Development

This project is written using [Hardhat](https://hardhat.org/)

`yarn` is the package manager used. yarn-lock is included in the repo. Do `yard add package --dev` to install new packages instead of `npm install --save-dev package`.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
GAS_REPORT=true npx hardhat test
npx hardhat node
npx hardhat run scripts/deploy.ts
```

## Testing

