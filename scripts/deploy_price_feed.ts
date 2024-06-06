import * as fs from 'fs';
import { getImplementationAddress } from '@openzeppelin/upgrades-core';
import { verifyContractCode, createOrGetDeployLog, ChainContractDeployer, getDeployTx } from './utils';
import {
  DEPLOY_LOG_DEPLOYER,
  DEPLOY_LOG_DEPLOY_TX_HASH,
  DEPLOY_LOG_DEPLOY_BLOCK_NUMBER,
  DEPLOY_PRICEFEED_LOG_PREFIX,
  DEPLOY_LOG_PRICEFEED_ADMINS,
  DEPLOY_LOG_PRICEFEED_PROXY,
  DEPLOY_LOG_PRICEFEED_PROXY_VERIFIED,
  DEPLOY_LOG_PRICEFEED_TARGET,
  DEPLOY_LOG_PRICEFEED_TARGET_VERIFIED,
} from './deploy_log_name';
import { initPriceFeedConfig } from './utils';
import { task, types } from 'hardhat/config';

function getFeedContractName() {
  return 'PriceFeed';
}

task('deployPriceFeed', 'Deploy price feed')
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    const skipVerify = taskArgs.skipVerify;
    console.log('skip verify contracts?', skipVerify);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();
    const deployerWallet = contractDeployer.deployerWallet;

    const priceFeedConfigs = await initPriceFeedConfig();
    for (const [, config] of priceFeedConfigs) {
      console.log('price feed config:', config);
      const token_symbol = config.symbol;
      const heartbeat = config.heartbeat;
      if (!token_symbol || !heartbeat) {
        console.log('Invalid config for token', token_symbol);
        continue;
      }
      const description = token_symbol + '/ USD';
      const decimals = 8;

      const log_name = DEPLOY_PRICEFEED_LOG_PREFIX + '_' + token_symbol;
      const { deployLogPath, deployLog } = createOrGetDeployLog(log_name, hardhat.network.name);
      const dLog = deployLog as any;
      dLog[DEPLOY_LOG_DEPLOYER] = await deployerWallet?.getAddress();
      fs.writeFileSync(deployLogPath, JSON.stringify(dLog, null, 2));

      // deploy priceFeed
      let priceFeedAddr;
      if (!(DEPLOY_LOG_PRICEFEED_PROXY in dLog)) {
        console.log(`deploy ${token_symbol} priceFeed...`);
        const contractName = getFeedContractName();

        const contract = await contractDeployer.deployProxy(contractName, [description, decimals, heartbeat], {
          unsafeAllow: ['constructor'],
          initializer: 'initialize',
        });
        const transaction = await getDeployTx(contract);
        priceFeedAddr = await contract.getAddress();
        dLog[DEPLOY_LOG_PRICEFEED_PROXY] = priceFeedAddr;
        dLog[DEPLOY_LOG_DEPLOY_TX_HASH] = transaction?.hash;
        dLog[DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction?.blockNumber;
        fs.writeFileSync(deployLogPath, JSON.stringify(dLog, null, 2));
      } else {
        priceFeedAddr = dLog[DEPLOY_LOG_PRICEFEED_PROXY];
      }
      console.log(`${token_symbol} price feed address: ${priceFeedAddr}`);

      let priceFeedTargetAddr;
      if (!(DEPLOY_LOG_PRICEFEED_TARGET in dLog)) {
        console.log(`get ${token_symbol} price feed target...`);
        priceFeedTargetAddr = await getImplementationAddress(hardhat.ethers.provider, priceFeedAddr);
        dLog[DEPLOY_LOG_PRICEFEED_TARGET] = priceFeedTargetAddr;
        fs.writeFileSync(deployLogPath, JSON.stringify(dLog, null, 2));
      } else {
        priceFeedTargetAddr = dLog[DEPLOY_LOG_PRICEFEED_TARGET];
      }
      console.log(`${token_symbol} price feed target: ${priceFeedTargetAddr}`);

      // verify proxy contract
      if (!(DEPLOY_LOG_PRICEFEED_PROXY_VERIFIED in dLog) && !skipVerify) {
        await verifyContractCode(hardhat, priceFeedTargetAddr, [], getFeedContractName());
        dLog[DEPLOY_LOG_PRICEFEED_PROXY_VERIFIED] = true;
        fs.writeFileSync(deployLogPath, JSON.stringify(dLog, null, 2));
      }
    }
  });

task('upgradePriceFeed', 'Upgrade price feed')
  .addParam('symbol', 'Token symbol', undefined, types.string, false)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    const skipVerify = taskArgs.skipVerify;
    const symbol = taskArgs.symbol;
    console.log('skip verify contracts?', skipVerify);
    console.log('symbol', symbol);

    const log_name = DEPLOY_PRICEFEED_LOG_PREFIX + '_' + symbol;
    const { deployLogPath, deployLog } = createOrGetDeployLog(log_name, hardhat.network.name);
    const dLog = deployLog as any;
    const contractAddr = dLog[DEPLOY_LOG_PRICEFEED_PROXY];
    if (contractAddr === undefined) {
      console.log('price feed address not exist');
      return;
    }
    console.log('price feed address:', contractAddr);
    const oldContractTargetAddr = dLog[DEPLOY_LOG_PRICEFEED_TARGET];
    if (oldContractTargetAddr === undefined) {
      console.log('price feed target address not exist');
      return;
    }
    console.log('price feed old target', oldContractTargetAddr);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    console.log('upgrade price feed...');
    const contractName = getFeedContractName();
    const contract = await contractDeployer.upgradeProxy(contractName, contractAddr, {
      unsafeAllow: ['constructor'],
    });
    const tx = await getDeployTx(contract);
    console.log('upgrade tx', tx?.hash);
    const newContractTargetAddr = await getImplementationAddress(hardhat.ethers.provider, contractAddr);
    dLog[DEPLOY_LOG_PRICEFEED_TARGET] = newContractTargetAddr;
    console.log('price feed new target', newContractTargetAddr);
    fs.writeFileSync(deployLogPath, JSON.stringify(dLog, null, 2));

    // verify target contract
    if (!skipVerify) {
      await verifyContractCode(hardhat, newContractTargetAddr, [], getFeedContractName());
      dLog[DEPLOY_LOG_PRICEFEED_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(dLog, null, 2));
    }
  });

task('setAdmin', 'Set admin')
  .addParam('override', 'Override', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    const isOverride = taskArgs.override;
    console.log('override setting?', isOverride);

    const priceFeedConfigs = await initPriceFeedConfig();
    for (const [, config] of priceFeedConfigs) {
      console.log('price feed config:', config);
      const token_symbol = config.symbol;
      const log_name = DEPLOY_PRICEFEED_LOG_PREFIX + '_' + token_symbol;
      const { deployLogPath, deployLog } = createOrGetDeployLog(log_name, hardhat.network.name);
      const dLog = deployLog as any;
      const contractAddr = dLog[DEPLOY_LOG_PRICEFEED_PROXY];
      if (contractAddr === undefined) {
        console.log(`${token_symbol} price feed address not exist`);
        return;
      }
      console.log(`${token_symbol} price feed address: ${contractAddr}`);
      let admins = dLog[DEPLOY_LOG_PRICEFEED_ADMINS];
      if (admins === undefined) {
        admins = [];
      }

      if (admins.length > 0 && !isOverride) {
        continue;
      }

      const priceFeedContract = await hardhat.ethers.getContractAt(getFeedContractName(), contractAddr);
      const adminPK = config.adminPK;
      if (adminPK === undefined) {
        console.log(`${token_symbol} admin pk not exist`);
        return;
      }
      const adminWallet = new hardhat.ethers.Wallet(adminPK, hardhat.ethers.provider);
      const adminAddr = await adminWallet.getAddress();
      console.log(`${token_symbol} admin address: ${adminAddr}`);

      const tx = await priceFeedContract.setAdmin(adminAddr, true);
      console.log('set admin tx', tx.hash);
      await tx.wait();
      admins.push(adminAddr);
      dLog[DEPLOY_LOG_PRICEFEED_ADMINS] = admins;
      fs.writeFileSync(deployLogPath, JSON.stringify(dLog, null, 2));
      console.log(`${token_symbol} price feed set admin success`);
    }
  });
