import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@openzeppelin/hardhat-upgrades';
import '@matterlabs/hardhat-zksync-deploy';
import '@matterlabs/hardhat-zksync-upgradable';
import '@matterlabs/hardhat-zksync-solc';
import '@matterlabs/hardhat-zksync-verify';
import 'solidity-coverage';
import * as dotenv from 'dotenv';
import { NetworksUserConfig, NetworkUserConfig } from 'hardhat/src/types/config';

import './scripts/deploy_price_feed'

dotenv.config();

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v6',
  },
  solidity: {
    compilers: [
      {
        version: '0.8.23',
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  defaultNetwork: process.env.DEFAULT_NETWORK || 'hardhat',
  networks: {
    hardhat: {
      zksync: false,
    },
    zklinkSepolia: {
      url: 'https://sepolia.rpc.zklink.io',
      ethNetwork: 'sepolia',
      verifyURL: 'https://sepolia.explorer.zklink.io/contract_verification',
      zksync: true,
    },
    zklinkNova: {
      url: 'https://rpc.zklink.io',
      ethNetwork: 'mainnet',
      verifyURL: 'https://explorer.zklink.io/contract_verification',
      zksync: true,
    },
  },
  zksolc: {
    version: '1.3.22',
    settings: {},
  },
  mocha: {
    timeout: 600000,
  },
};

if (!!config.defaultNetwork && config.defaultNetwork !== 'hardhat' && !!process.env.WALLET_PRIVATE_KEY) {
  const ns = config.networks as NetworksUserConfig;
  const nu = ns[config.defaultNetwork] as NetworkUserConfig;
  nu.accounts = [process.env.WALLET_PRIVATE_KEY];
}

export default config;