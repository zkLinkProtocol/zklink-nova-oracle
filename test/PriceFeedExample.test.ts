import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Contract, parseUnits } from 'ethers';
import { PriceFeedExample } from '../typechain';

describe('PriceFeedExample', function () {
  const ETH_PRICE = parseUnits('3000', 8);
  const WBTC_PRICE = parseUnits('60000', 8);
  let defaultPriceFeed: Contract;
  let defaultPriceFeedAddr: string;
  let otherPriceFeed: Contract;
  let otherPriceFeedAddr: string;
  let priceFeedExample: PriceFeedExample;
  let priceFeedExampleAddr: string;

  before(async function () {
    const DefaultPriceFeed = await ethers.getContractFactory('PriceFeed');
    defaultPriceFeed = await upgrades.deployProxy(DefaultPriceFeed, ['ETH/USD', 8, 3600], {
      kind: 'uups',
      unsafeAllow: ['constructor'],
      initializer: 'initialize',
    });
    defaultPriceFeedAddr = await defaultPriceFeed.getAddress();
    console.log('defaultPriceFeedAddr:', defaultPriceFeedAddr);
    const set_ETH_price_tx = await defaultPriceFeed.setLatestAnswer(ETH_PRICE);
    await set_ETH_price_tx.wait();

    otherPriceFeed = await upgrades.deployProxy(DefaultPriceFeed, ['WBTC/USD', 8, 3600], {
      kind: 'uups',
      unsafeAllow: ['constructor'],
      initializer: 'initialize',
    });
    otherPriceFeedAddr = await otherPriceFeed.getAddress();
    console.log('otherPriceFeedAddr:', otherPriceFeedAddr);
    const set_WBTC_price_tx = await otherPriceFeed.setLatestAnswer(WBTC_PRICE);
    await set_WBTC_price_tx.wait();

    const PriceFeedExample = await ethers.getContractFactory('PriceFeedExample');
    priceFeedExample = await PriceFeedExample.deploy(defaultPriceFeedAddr);
    priceFeedExampleAddr = await priceFeedExample.getAddress();
    console.log('priceFeedExampleAddr:', priceFeedExampleAddr);
  });

  it('Get latest answer by default priceFeed', async function () {
    const latestAnswer = await priceFeedExample.getLatestAnswer();
    expect(latestAnswer).to.equal(ETH_PRICE);
  });

  it('Get latest answer by other priceFeed', async function () {
    const latestAnswer = await priceFeedExample.getLatestAnswerWithOtherPriceFeed(otherPriceFeedAddr);
    expect(latestAnswer).to.equal(WBTC_PRICE);
  });
});
