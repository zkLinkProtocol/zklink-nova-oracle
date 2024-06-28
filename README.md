# zklink-nova-oracle
This repository describes how to use Oracle on the Nova network. price feeds are taken from the pyth network.

## Prereqs
1. Install dependencies
```shell
npm install
```
2. Copy the `.env.example` file to `.env` and set the values accordingly:
   - `DEFAULT_NETWORK`: hardhat default network name
   - `WALLET_PRIVATE_KEY`: deployer's private key
   - `NOVA_RPC`: nova RPC for priceFeedService
   - `SUPPORT_TOKEN_IDS`: oracle supported Token identifiers, separated by `,` for example: `1,2,3`
   - `TOKEN_*_SYMBOL`: token symbol, for example: `ETH`
   - `TOKEN_*_PRICEFEED_ID`: the symbol identifies the price feed on the [pyth network](https://pyth.network/price-feeds)
   - `TOKEN_*_ADMIN_PK`: the symbol sets the latest price of the wallet
   - `TOKEN_*_PRICEFEED`: PriceFeed contract address for this symbol
   - `TOKEN_*_THRESHOLD`: floating threshold for the updated price of the symbol
   - `TOKEN_*_HEARTBEAT`: maximum time difference when updating the price of this symbol

## Deploy
### Compile
```shell
npm run compile
```
### Depoly
```shell
npm run deploy
```
### Set admin
```shell
npm run set:admin
```

## Test
```shell
npm run test
```

## Upgrade
```shell
npx hardhat upgradePriceFeed --symbol "wETH"
```

## Start service
### Local
```shell
npm run run:priceFeed
```

### pm2
```shell
pm2 start --name priceFeedService "npm run run:priceFeed"
```