const {constants} = require('@openzeppelin/test-helpers');

require('@nomiclabs/hardhat-ethers');

const ADDRESSES = {};
const gasLimit = 50000;
const daiAddress = '0xf80A32A835F79D7787E8a8ee5721D0fEaFd78108';
const usdcAddress = '0x851dEf71f0e6A903375C1e536Bd9ff1684BAD802';
const usdtAddress = '0xB404c51BBC10dcBE948077F18a4B8E553D160084';
const wethAddress = '0xbca556c912754bc8e7d4aad20ad69a1b1444f42d';
const supportedTokens = [
  '0xbca556c912754bc8e7d4aad20ad69a1b1444f42d', // weth
  '0xCe4aA1dE3091033Ba74FA2Ad951f6adc5E5cF361', // knc
  '0x1a906E71FF9e28d8E01460639EB8CF0a6f0e2486', // link
  '0xa0E54Ab6AA5f0bf1D62EC3526436F3c05b3348A0', // wbtc
  daiAddress, // dai
  usdcAddress, // usdc
  usdtAddress, // usdt
  wethAddress, // weth
];

const gst2 = '0x0000000000b3F879cb30FE243b4Dfee438691c04';
const uniswapRouter = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const kyberProxy = '0xd719c34261e099Fdb33030ac8909d5788D3039C4';
const aEth = '0x2433A1b6FcF156956599280C3Eb1863247CFE675';
const aEthV2 = '0x87b1f4cf9bd63f7bbd3ee1ad04e8f52540349347';
const cEth = '0x859e9d8a4edadfEDb5A2fF311243af80F85A91b8';
const compTroller = '0xcfa7b0e37f5AC60f3ae25226F5e39ec59AD26152';
const compTokens = [
  '0xaF50a5A6Af87418DAC1F28F9797CeB3bfB62750A',
  '0x7Ac65E0f6dBA0EcB8845f17d07bF0776842690f8',
  '0x2973e69b20563bcc66dC63Bde153072c33eF37fe',
  '0x6B8b0D7875B4182Fb126877023fB93b934dD302A',
  '0x70014768996439F71C041179Ffddce973a83EEf2',
  '0x65280b21167BBD059221488B7cBE759F9fB18bB5',
  '0xbc689667C13FB2a04f09272753760E38a95B998C',
  '0xF6958Cf3127e62d3EB26c79F4f45d3F3b2CcdeD4',
  '0x2862065D57749f1576F48eF4393eb81c45fC2d88',
  '0x541c9cB0E97b77F142684cc33E8AC9aC17B1990F'
];
const lendingPoolV1 = '0x9E5C7835E4b13368fd628196C4f1c6cEc89673Fa';
const lendingPoolCoreV1 = '0x4295Ee704716950A4dE7438086d6f0FBC0BA9472';
const lendingPoolV2 = '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9';
const providerV2 = '0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d';

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

task('deployRopsten', 'Deploys the SmartWallet contracts').setAction(async () => {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const deployContracts = [
    // 'BurnGasHelper',
    'SmartWalletLending',
    'SmartWalletSwapImplementation',
    'SmartWalletSwapProxy',
  ];
  const instances = {};
  let instance;
  let args;
  let step = 0;
  let tx;

  // Deployment

  console.log(`Deploying Contracts using ${deployerAddress}`);
  console.log('============================\n');

  args = [
    // [deployerAddress, gst2],
    [deployerAddress],
    [deployerAddress],
    [deployerAddress, null, kyberProxy, [uniswapRouter]],
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
    [daiAddress, usdcAddress, wethAddress],
    [kyberProxy, uniswapRouter],
    false,
    {gasLimit}
  );
  printInfo(tx);
  step++;
  console.log('\n');

  // Update lending implementation and proxy
  console.log(`   ${parseInt(step) + 1}.  updateLendingImplementation`);
  console.log('   ------------------------------------');
  tx = await instance.updateLendingImplementation(ADDRESSES['SmartWalletLending'], {
    gasLimit,
  });
  printInfo(tx);
  step++;
  console.log('\n');

  // Update BurnGasHelper
  console.log(`   ${parseInt(step) + 1}.  updateBurnGasHelper`);
  console.log('   ------------------------------------');
  tx = await instance.updateBurnGasHelper(0, {
    gasLimit,
  });
  printInfo(tx);
  step++;
  console.log('\n');

  // Add supported platform wallets
  console.log(`   ${parseInt(step) + 1}.  updateSupportedPlatformWallets`);
  console.log('   ------------------------------------');
  tx = await instance.updateSupportedPlatformWallets(supportedWallets, true, {
    gasLimit,
  });
  printInfo(tx);
  step++;
  console.log('\n');

  console.log('Initializing SmartWalletLending');
  console.log('======================\n');
  instance = await ethers.getContractAt('SmartWalletLending', ADDRESSES['SmartWalletLending']);

  // Update Aave lending pool data to lending implementation
  console.log(`   ${parseInt(step) + 1}.  updateAaveLendingPoolData`);
  console.log('   ------------------------------------');
  tx = await instance.updateAaveLendingPoolData(
    constants.ZERO_ADDRESS,
    constants.ZERO_ADDRESSdress,
    lendingPoolV1,
    lendingPoolCoreV1,
    0,
    '0x9E5C7835E4b13368fd628196C4f1c6cEc89673Fa',
    [
      ethAddress,
      "0xf80A32A835F79D7787E8a8ee5721D0fEaFd78108", // dai
      "0x851dEf71f0e6A903375C1e536Bd9ff1684BAD802", // usdc
      "0xCe4aA1dE3091033Ba74FA2Ad951f6adc5E5cF361", // knc
    ],
    {gasLimit}
  );
  printInfo(tx);
  step++;
  console.log('\n');

  // Update Compound lending pool data to lending implementation
  console.log(`   ${parseInt(step) + 1}.  updateCompoundData`);
  console.log('   ------------------------------------');
  tx = await instance.updateCompoundData(
    compTroller,
    cEth,
    compTokens,
    {gasLimit}
  );
  printInfo(tx);
  step++;
  console.log('\n');

  // Update proxy to lending implementation
  console.log(`   ${parseInt(step) + 1}.  updateSwapImplementation`);
  console.log('   ------------------------------------');
  tx = await instance.updateSwapImplementation(
    ADDRESSES['SmartWalletSwapProxy'],
    {gasLimit}
  );
  printInfo(tx);
  step++;
  console.log('\n');

  // Summary

  console.log('Summary');
  console.log('=======\n');
  for (let contract of deployContracts) {
    console.log(`   > ${contract}: ${ADDRESSES[contract]}`);
  }

  console.log('\nDeployment complete!');
});
