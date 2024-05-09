import { PriceServiceConnection } from '@pythnetwork/price-service-client';
import { PriceFeed__factory, PriceFeed } from '../typechain';
import { BigNumber } from '@ethersproject/bignumber';
import { Wallet, Provider, types } from 'zksync-ethers';
import { initPriceFeedConfig, PriceConfig } from '../scripts/utils';
import dotenv from 'dotenv';
// Load env file
dotenv.config();

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const provider = new Provider(process.env.NOVA_RPC);

async function updatePrice(priceFeedConfigs: Map<string, PriceConfig>) {
  console.log('Update price');

  const denominator = process.env.THRESHOLD_DENOMINATOR;
  if (!denominator) {
    throw new Error('THRESHOLD_DENOMINATOR is required');
  }

  const pyth_endpoint = process.env.PYTH_RPC;
  if (!pyth_endpoint) {
    throw new Error('PYTH_RPC is required');
  }
  const priceServiceConnection = new PriceServiceConnection(pyth_endpoint, {
    priceFeedRequestConfig: { binary: true },
  });

  // Hermes provides other methods for retrieving price updates. See
  // https://hermes.pyth.network/docs for more information.
  const priceFeeds = await priceServiceConnection.getLatestPriceFeeds([...priceFeedConfigs.keys()]);
  if (!priceFeeds) {
    throw new Error('Invalid price feeds');
  }
  for (const priceFeed of priceFeeds) {
    const price = priceFeed.getPriceUnchecked();
    const priceConfig = priceFeedConfigs.get(priceFeed.id);
    if (!price || !priceConfig) {
      throw new Error('Invalid price feed');
    }

    const promptPrice = price.price;
    const promptUpdate = price.publishTime;

    console.log(`Price for ${priceConfig.symbol} is ${promptPrice} at ${new Date(promptUpdate * 1000).toISOString()}`);

    let isShouldUpdate: boolean = false;
    if (priceConfig.lastPrice && priceConfig.lastUpdate) {
      const timeElapsed = promptUpdate - priceConfig.lastUpdate;
      if (timeElapsed >= priceConfig.heartbeat) {
        isShouldUpdate = true;
      }

      const priceDiff = BigNumber.from(promptPrice).sub(priceConfig.lastPrice).abs();
      const priceDiffPercentage = priceDiff.mul(denominator).div(priceConfig.lastPrice);
      if (priceDiffPercentage.gt(priceConfig.threshold)) {
        isShouldUpdate = true;
      }
    } else {
      isShouldUpdate = true;
    }

    if (isShouldUpdate) {
      setLatestAnswer(priceConfig.adminPK, priceConfig.priceFeed, promptPrice);

      // Update the last price and last update
      priceConfig.lastPrice = BigNumber.from(promptPrice);
      priceConfig.lastUpdate = promptUpdate;
      priceFeedConfigs.set(priceFeed.id, priceConfig);
      console.log(`Setting latest answer for ${priceConfig.priceFeed} to ${promptPrice}.`);
    }
  }
}

async function setLatestAnswer(walletPK: string, priceFeedAddress: string, promptPrice: string) {
  const wallet = new Wallet(walletPK, provider);
  const priceFeedContract: PriceFeed = PriceFeed__factory.connect(priceFeedAddress, wallet);
  const tx = await priceFeedContract.setLatestAnswer(promptPrice);

  let txHash = tx.hash;
  let isTxSuccess = await checkTxReceipt(txHash);
  while (!isTxSuccess) {
    const replaceResult = await tryReplaceStuckTx(txHash, wallet);
    isTxSuccess = replaceResult.isTxSuccess;
    txHash = replaceResult.txHash;
  }
}

async function checkTxReceipt(txHash: string): Promise<boolean> {
  const receipt = await provider.waitForTransaction(txHash);

  if (!!receipt && receipt.status === 1) {
    return true;
  }
  return false;
}

async function tryReplaceStuckTx(txHash: string, wallet: Wallet) {
  console.log(`The update price tx stuck, replace it...`);
  const gasPriceBump = BigNumber.from('1200');
  const gasPriceBumpDivisor = BigNumber.from('1000');
  const txResponse = await wallet.provider.getTransaction(txHash);
  if (!txResponse) {
    throw new Error(`The tx ${txHash} is not found`);
  }
  let txRequest: types.TransactionRequest;
  if (txResponse.type === 2) {
    txRequest = {
      to: txResponse.to,
      value: txResponse.value,
      data: txResponse.data,
      maxFeePerGas: BigNumber.from(txResponse.maxFeePerGas).mul(gasPriceBump).div(gasPriceBumpDivisor).toBigInt(),
      maxPriorityFeePerGas: BigNumber.from(txResponse.maxPriorityFeePerGas)
        .mul(gasPriceBump)
        .div(gasPriceBumpDivisor)
        .toBigInt(),
      gasLimit: BigNumber.from(txResponse.gasLimit).mul(gasPriceBump).div(gasPriceBumpDivisor).toBigInt(),
    };
  } else {
    txRequest = {
      to: txResponse.to,
      value: txResponse.value,
      data: txResponse.data,
      gasPrice: BigNumber.from(txResponse.gasPrice).mul(gasPriceBump).div(gasPriceBumpDivisor).toBigInt(),
      gasLimit: BigNumber.from(txResponse.gasLimit).mul(gasPriceBump).div(gasPriceBumpDivisor).toBigInt(),
    };
  }

  const replaceTx = await wallet.sendTransaction(txRequest);
  console.log(`The replace tx hash is: ${replaceTx.hash}`);
  return {
    isTxSuccess: await checkTxReceipt(replaceTx.hash),
    txHash: replaceTx.hash,
  };
}

async function main() {
  const priceFeedConfigs = await initPriceFeedConfig();
  /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
  while (true) {
    try {
      await updatePrice(priceFeedConfigs);
    } catch (e) {
      console.log('Error: ', e);
    }
    await sleep(2000);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
