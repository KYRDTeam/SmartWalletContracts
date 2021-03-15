const {constants} = require('@openzeppelin/test-helpers');
require('@nomiclabs/hardhat-ethers');

const ADDRESSES = {};
const gasLimit = 500000;
const aaveReferral = 157;
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f';
const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const usdtAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const wethAddress = '0xd0a1e359811322d97991e03f863a0c30c2cf029c';
const supportedTokens = [
  '0xd0a1e359811322d97991e03f863a0c30c2cf029c'
];

const gst2 = '0x0000000000004946c0e9f43f4dee607b0ef1fa1c';
const uniswapRouter = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const sushiswapRouter = '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f';
const kyberProxy = '0xc153eeAD19e0DBbDb3462Dcc2B703cC6D738A37c';
const aEth = '0xD483B49F2d55D2c53D32bE6efF735cB001880F79';
const aEthV2 = '0x87b1f4cf9bd63f7bbd3ee1ad04e8f52540349347';
const cEth = '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72';
const comp = '0x61460874a7196d6a22d1ee4922473664b3e95270';
const compTroller = '0x5eae89dc1c671724a672ff0630122ee834098657';
const compTokens = [
  '0xf0d0eb522cfa50b716b3b1604c4f0fa6f04376ad', // cdai
  '0x4a92e71227d294f041bd82dd8f78591b75140d63', // cusdc
  '0x3f0a0ea2f86bae6362cf9799b523ba06647da018' // cusdt
];
const lendingPoolV1 = '0x580D4Fdc4BF8f9b5ae2fb9225D584fED4AD5375c';
const lendingPoolCoreV1 = '0x95D1189Ed88B380E319dF73fF00E479fcc4CFa45';
const lendingPoolV2 = '0xE0fBa4Fc209b4948668006B2bE61711b7f465bAe';
const providerV2 = '0x3c73A5E5785cAC854D468F727c606C07488a29D6';

const supportedWallets = [
  '0x3fFFF2F4f6C0831FAC59534694ACd14AC2Ea501b', // android
  '0x9a68f7330A3Fe9869FfAEe4c3cF3E6BBef1189Da', // ios
  '0x440bBd6a888a36DE6e2F6A25f65bc4e16874faa9', // web
];

async function deploy(step, ethers, contract, ...args) {
  console.log(`   ${parseInt(step) + 1}. Deploying '${contract}'`);
  console.log('   ------------------------------------');

  const Contract = await ethers.getContractFactory(contract);
  const instance = await Contract.deploy(...args);
  tx = await instance.deployed();
  printInfo(tx.deployTransaction);
  console.log(`   > address:\t${instance.address}\n\n`);

  ADDRESSES[contract] = instance.address;
}

function printInfo(tx) {
  console.log(`   > tx hash:\t${tx.hash}`);
  console.log(`   > gas price:\t${tx.gasPrice.toString()}`);
  console.log(`   > gas used:\t${tx.gasLimit.toString()}`);
}

task('deployKovan', 'Deploys the SmartWallet contracts').setAction(async () => {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const deployContracts = [
    // 'BurnGasHelper',
    // 'SmartWalletLending',
    // 'SmartWalletSwapImplementation',
    'SmartWalletSwapProxy',
  ];
  const instances = {};
  let instance;
  let args;
  let step = 0;
  let tx;

  // Deployment

  // console.log(`Deploying Contracts using ${deployerAddress}`);
  // console.log('============================\n');

  ADDRESSES['SmartWalletLending'] = '0x61D5E3479c23EF96530a2A59A064B7aE7Fa5e46C';
  ADDRESSES['SmartWalletSwapImplementation'] = '0x6CA2ffDE3F132787C682a35b4A94577ec290B5E2';
  ADDRESSES['SmartWalletSwapProxy'] = '0xF090f0DC737Bd37073114C29B43D6D9024C4f99c';

  args = [
    // [deployerAddress, gst2],
    // [deployerAddress],
    // [deployerAddress],
    [deployerAddress, null, kyberProxy, [uniswapRouter, sushiswapRouter]],
  ];
  for (let index in deployContracts) {
    if (deployContracts[index] === 'SmartWalletSwapProxy') args[index][1] = ADDRESSES['SmartWalletSwapImplementation'];
    instances[deployContracts[index]] = await deploy(step, ethers, deployContracts[index], ...args[index]);
    step++;
  }

  // Initialization

  console.log('Initializing SmartWalletSwapProxy');
  console.log('======================\n');
  instance = await ethers.getContractAt('SmartWalletSwapImplementation', ADDRESSES['SmartWalletSwapProxy']);

  // Approve allowances to Kyber and Uniswap routers
  console.log(`   ${parseInt(step) + 1}.  approveAllowances`);
  console.log('   ------------------------------------');
  tx = await instance.approveAllowances(
    [wethAddress],
    [kyberProxy, uniswapRouter, sushiswapRouter],
    false,
    {gasLimit}
  );
  printInfo(tx);
  step++;
  console.log('\n');

  // // Update lending implementation and proxy
  // console.log(`   ${parseInt(step) + 1}.  updateLendingImplementation`);
  // console.log('   ------------------------------------');
  // tx = await instance.updateLendingImplementation(ADDRESSES['SmartWalletLending'], {
  //   gasLimit,
  // });
  // printInfo(tx);
  // step++;
  // console.log('\n');

  // // Update BurnGasHelper
  // console.log(`   ${parseInt(step) + 1}.  updateBurnGasHelper`);
  // console.log('   ------------------------------------');
  // tx = await instance.updateBurnGasHelper(constants.ZERO_ADDRESS, {
  //   gasLimit,
  // });
  // printInfo(tx);
  // step++;
  // console.log('\n');

  // // Add supported platform wallets
  // console.log(`   ${parseInt(step) + 1}.  updateSupportedPlatformWallets`);
  // console.log('   ------------------------------------');
  // tx = await instance.updateSupportedPlatformWallets(supportedWallets, true, {
  //   gasLimit,
  // });
  // printInfo(tx);
  // step++;
  // console.log('\n');

  // console.log('Initializing SmartWalletLending');
  // console.log('======================\n');
  instance = await ethers.getContractAt('SmartWalletLending', ADDRESSES['SmartWalletLending']);

  // // Update Aave lending pool data to lending implementation
  // console.log(`   ${parseInt(step) + 1}.  updateAaveLendingPoolData`);
  // console.log('   ------------------------------------');
  // tx = await instance.updateAaveLendingPoolData(
  //   lendingPoolV2,
  //   providerV2,
  //   lendingPoolV1,
  //   lendingPoolCoreV1,
  //   0,
  //   wethAddress,
  //   [
  //     ethAddress,
  //     "0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD", // dai
  //     "0xe22da380ee6B445bb8273C81944ADEB6E8450422", // usdc
  //     "0x3F80c39c0b96A0945f9F0E9f55d8A8891c5671A8", // knc
  //   ],
  //   {gasLimit}
  // );
  // printInfo(tx);
  // step++;
  // console.log('\n');

  // // Update Compound lending pool data to lending implementation
  // console.log(`   ${parseInt(step) + 1}.  updateCompoundData`);
  // console.log('   ------------------------------------');
  // tx = await instance.updateCompoundData(
  //   compTroller,
  //   cEth,
  //   compTokens,
  //   {gasLimit}
  // );
  // printInfo(tx);
  // step++;
  // console.log('\n');

  // // Update proxy to lending implementation
  // console.log(`   ${parseInt(step) + 1}.  updateSwapImplementation`);
  // console.log('   ------------------------------------');
  // tx = await instance.updateSwapImplementation(
  //   ADDRESSES['SmartWalletSwapProxy'],
  //   {gasLimit}
  // );
  // printInfo(tx);
  // step++;
  // console.log('\n');

  // Summary

  console.log('Summary');
  console.log('=======\n');
  for (let contract of deployContracts) {
    console.log(`   > ${contract}: ${ADDRESSES[contract]}`);
  }

  console.log('\nDeployment complete!');
});
