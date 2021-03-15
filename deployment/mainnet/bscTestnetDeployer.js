const {constants} = require('@openzeppelin/test-helpers');
require('@nomiclabs/hardhat-ethers');

const ADDRESSES = {};
const gasLimit = 500000;
const bnbAddress = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const busdAddress = '0xed24fc36d5ee211ea25a80239fb8c4cfd80f12ee';
const daiAddress = '0xec5dcb5dbf4b114c9d0f65bccab49ec54f6a0867';
const usdcAddress = '0x64544969ed7ebf5f083679233325356ebe738930';
const usdtAddress = '0x337610d27c682e347c9cd60bd4b3b107c9d34ddd';
const wbnbAddress = '0xae13d989dac2f0debff460ac112a837c89baa7cd';
const supportedTokens = [
  bnbAddress,
  daiAddress, // dai
  usdcAddress, // usdc
  usdtAddress, // usdt
  wbnbAddress, // wbnb
];

const pancakeRouter = '0xD99D1c33F9fC3444f8101754aBC46c52416550D1';
const kyberProxy = '0x9AAb3f75489902f3a48495025729a0AF77d4b11e';
const vBnb = '0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c';
const compTroller = '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b';
const vTokens = [
  '0x74469281310195A04840Daf6EdF576F559a3dE80',
  '0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7',
  '0xb7526572FFE56AB9D7489838Bf2E18e3323b441A',
  '0x08e0A5575De71037aE36AbfAfb516595fE68e5e4',
  '0x6d6F697e34145Bb95c54E77482d97cc261Dc237E',
  '0xb6e9322C49FD75a367Fcb17B0Fcd62C5070EbCBe',
  '0x162D005F0Fff510E54958Cfc5CF32A3180A84aab',
  '0xAfc13BC065ABeE838540823431055D2ea52eBA52',
  '0x488aB2826a154da01CC4CC16A8C83d4720D3cA2C',
  '0x37C28DE42bA3d22217995D146FC684B2326Ede64',
];

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

task('deploy', 'Deploys the SmartWallet contracts').setAction(async () => {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const deployContracts = [
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
    [deployerAddress],
    [deployerAddress],
    [deployerAddress, null, kyberProxy, [pancakeRouter]],
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

  // Approve allowances to Kyber and PancakeSwap routers
  console.log(`   ${parseInt(step) + 1}.  approveAllowances`);
  console.log('   ------------------------------------');
  tx = await instance.approveAllowances(
    [busdAddress, daiAddress, usdcAddress, usdtAddress],
    [kyberProxy, pancakeRouter],
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

  // Update Venus lending pool data to lending implementation
  console.log(`   ${parseInt(step) + 1}.  updateVenusData`);
  console.log('   ------------------------------------');

  tx = await instance.updateVenusData(
    compTroller,
    vBnb,
    vTokens,
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
