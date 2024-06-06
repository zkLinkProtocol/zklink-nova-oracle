import * as fs from 'fs';
import * as path from 'path';
import { Wallet, Provider } from 'zksync-ethers';
import { Deployer } from '@matterlabs/hardhat-zksync-deploy';
import { HardhatRuntimeEnvironment, Network, HttpNetworkConfig } from 'hardhat/types';
import { BaseContract, Signer, ContractTransactionResponse } from 'ethers';
import { BigNumber } from '@ethersproject/bignumber';
import { DeployProxyOptions, UpgradeProxyOptions } from '@openzeppelin/hardhat-upgrades/src/utils/options';
import * as dotenv from 'dotenv';
dotenv.config();

export type PriceConfig = {
  symbol: string;
  priceFeed: string;
  adminPK: string;
  threshold: number;
  heartbeat: number;
  lastPrice?: BigNumber;
  lastUpdate?: number;
};

export async function verifyContractCode(
  hardhat: HardhatRuntimeEnvironment,
  address: string,
  constructorArguments: any[],
  contractName: string,
) {
  // contract code may be not exist after tx send to chain
  // try every one minutes if verify failed
  console.log('verify %s code...', address);
  const contrctArtifact = await hardhat.artifacts.readArtifact(contractName);

  /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
  while (true) {
    try {
      await hardhat.run('verify:verify', {
        address: address,
        contract: `${contrctArtifact.sourceName}:${contractName}`,
        constructorArguments: constructorArguments,
        bytecode: contrctArtifact.bytecode,
        noCompile: true,
      });
      console.log('contract code verified success');
      return;
    } catch (e: any) {
      if (
        e.message.includes('Already Verified') ||
        e.message.includes('already verified') ||
        e.message.includes('Contract source code already verified') ||
        e.message.includes('Smart-contract already verified')
      ) {
        console.log('contract code already verified');
        return;
      } else {
        console.warn('verify code failed: %s', e.message);
      }
    }
    await new Promise(r => setTimeout(r, 30000));
  }
}

export async function getDeployTx(contract: any) {
  if (contract.deployTransaction !== undefined) {
    // ethers v5
    return await contract.deployTransaction.wait();
  } else if (contract.deploymentTransaction !== undefined) {
    // ethers v6
    return (contract.deploymentTransaction() as ContractTransactionResponse).wait();
  } else {
    return undefined;
  }
}

export function createOrGetDeployLog(name: string, network: string) {
  const deployLogPath = getDeployLogPath(name, network);
  console.log('deploy log path', deployLogPath);
  const logPath = path.dirname(deployLogPath);
  if (!fs.existsSync(logPath)) {
    fs.mkdirSync(logPath, { recursive: true });
  }

  let deployLog = {};
  if (fs.existsSync(deployLogPath)) {
    const data = fs.readFileSync(deployLogPath, 'utf8');
    deployLog = JSON.parse(data);
  }
  return { deployLogPath, deployLog };
}

export function getDeployLog(name: string, network: string) {
  const deployLogPath = getDeployLogPath(name, network);
  console.log('deploy log path', deployLogPath);
  if (!fs.existsSync(deployLogPath)) {
    throw 'deploy log not exist';
  }
  const data = fs.readFileSync(deployLogPath, 'utf8');
  const deployLog = JSON.parse(data);
  return { deployLogPath, deployLog };
}

export function readDeployContract(logName: string, contractName: string, network: string) {
  return readDeployLogField(logName, contractName, network);
}

export function readDeployLogField(logName: string, fieldName: string, network: string) {
  const deployLogPath = getDeployLogPath(logName, network);
  if (!fs.existsSync(deployLogPath)) {
    throw 'deploy log not exist: ' + deployLogPath;
  }
  const data = fs.readFileSync(deployLogPath, 'utf8');
  const deployLog = JSON.parse(data);
  const fieldValue = deployLog[fieldName];
  if (fieldValue === undefined) {
    throw fieldName + ' not exit';
  }
  return fieldValue;
}

export function getLogName(prefix: string, netName: string) {
  return prefix + '_' + netName;
}

export function getDeployLogPath(logName: string, network: string) {
  const zkLinkRoot = path.resolve(__dirname, '..');
  return `${zkLinkRoot}/log/${logName}_${network}.log`;
}

export async function removeHexPrefix(hexWithPrefix: string) {
  hexWithPrefix = hexWithPrefix.toLowerCase();
  if (hexWithPrefix.startsWith('0x')) {
    return hexWithPrefix.slice(2);
  } else {
    return hexWithPrefix;
  }
}

export async function initPriceFeedConfig() {
  console.log('Init config');

  const supportTokenIds = !process.env.SUPPORT_TOKEN_IDS
    ? []
    : process.env.SUPPORT_TOKEN_IDS.split(',').map(c => Number(c));

  const priceFeedConfigs = new Map<string, PriceConfig>();

  for (const tokenId of supportTokenIds) {
    const symbol = process.env[`TOKEN_${tokenId}_SYMBOL`];
    const priceFeed = process.env[`TOKEN_${tokenId}_PRICEFEED`];
    const threshold = Number(process.env[`TOKEN_${tokenId}_THRESHOLD`]);
    const heartbeat = Number(process.env[`TOKEN_${tokenId}_HEARTBEAT`]);
    const adminPK = process.env[`TOKEN_${tokenId}_ADMIN_PK`];
    const priceFeedId = process.env[`TOKEN_${tokenId}_PRICEFEED_ID`];

    if (!symbol || !priceFeed || !adminPK || !threshold || !heartbeat || !priceFeedId) {
      console.error(`Invalid config for token ${tokenId}`);
      continue;
    }

    const _id = await removeHexPrefix(priceFeedId);
    priceFeedConfigs.set(_id, {
      symbol,
      priceFeed,
      adminPK,
      threshold,
      heartbeat,
    });
  }

  return priceFeedConfigs;
}

export class ChainContractDeployer {
  hardhat: HardhatRuntimeEnvironment;
  deployerWallet: Wallet | Signer | undefined;
  zkSyncProvider: Provider | undefined;
  zkSyncDeployer: Deployer | undefined;
  zksync: boolean | undefined;

  constructor(hardhat: HardhatRuntimeEnvironment) {
    this.hardhat = hardhat;
  }

  async init() {
    console.log('init contract deployer...');
    const network: Network = this.hardhat.network;
    const networkConfig = network.config;
    // a flag to identify if chain is zksync
    this.zksync = network.zksync !== undefined && network.zksync;
    console.log('deploy on zksync?', this.zksync);
    // use the first account of accounts in the hardhat network config as the deployer
    const deployerKey: string = (networkConfig.accounts as string[])[0];
    if (this.zksync) {
      this.zkSyncProvider = new Provider((networkConfig as HttpNetworkConfig).url);
      this.deployerWallet = new Wallet(deployerKey, this.zkSyncProvider);
      this.zkSyncDeployer = new Deployer(this.hardhat, this.deployerWallet as Wallet);
    } else {
      [this.deployerWallet] = await this.hardhat.ethers.getSigners();
    }

    const deployerAAddr = await this.deployerWallet.getAddress();
    console.log('deployer', deployerAAddr);
    const balance = await this.hardhat.ethers.provider.getBalance(deployerAAddr);
    console.log('deployer balance', this.hardhat.ethers.formatEther(balance));
  }

  async deployContract(contractName: string, deployArgs: any[]) {
    let contract: BaseContract;
    if (this.zksync) {
      const artifact = await (this.zkSyncDeployer as Deployer).loadArtifact(contractName);
      contract = await (this.zkSyncDeployer as Deployer).deploy(artifact, deployArgs);
    } else {
      const factory = await this.hardhat.ethers.getContractFactory(contractName);
      contract = await factory.connect(this.deployerWallet as Signer).deploy(...deployArgs);
    }
    await contract.waitForDeployment();
    return contract;
  }

  async deployProxy(contractName: string, initArgs: any[], opts: DeployProxyOptions) {
    if (opts.constructorArgs === undefined) {
      opts.constructorArgs = [];
    }
    if (opts.kind === undefined) {
      opts.kind = 'uups';
    }
    let contract;
    if (this.zksync) {
      const artifact = await (this.zkSyncDeployer as Deployer).loadArtifact(contractName);
      contract = await this.hardhat.zkUpgrades.deployProxy(this.deployerWallet as Wallet, artifact, initArgs, {
        kind: opts.kind,
        constructorArgs: opts.constructorArgs,
        unsafeAllow: opts.unsafeAllow,
        initializer: opts.initializer,
      });
    } else {
      const factory = await this.hardhat.ethers.getContractFactory(contractName, this.deployerWallet);
      contract = await this.hardhat.upgrades.deployProxy(factory, initArgs, {
        kind: opts.kind,
        constructorArgs: opts.constructorArgs,
        unsafeAllow: opts.unsafeAllow,
        initializer: opts.initializer,
      });
    }
    await contract.waitForDeployment();
    return contract;
  }

  async upgradeProxy(contractName: string, contractAddr: string, opts: UpgradeProxyOptions) {
    let contract;
    if (this.zksync) {
      const artifact = await (this.zkSyncDeployer as Deployer).loadArtifact(contractName);
      contract = await this.hardhat.zkUpgrades.upgradeProxy(this.deployerWallet as Wallet, contractAddr, artifact, {
        constructorArgs: opts.constructorArgs,
        unsafeAllow: opts.unsafeAllow,
      });
    } else {
      const factory = await this.hardhat.ethers.getContractFactory(contractName, this.deployerWallet);
      contract = await this.hardhat.upgrades.upgradeProxy(contractAddr, factory, {
        constructorArgs: opts.constructorArgs,
        unsafeAllow: opts.unsafeAllow,
      });
    }
    await contract.waitForDeployment();
    return contract;
  }
}
