require('@nomiclabs/hardhat-ethers');

const ADDRESSES = {};
const gasLimit = 50000;
const daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f';
const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const usdtAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const wethAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const supportedTokens = [
  '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', // aave
  '0xba100000625a3754423978a60c9317c58a424e3d', // bal
  '0x0d8775f648430679a709e98d2b0cb6250d2887ef', // bat
  '0x4Fabb145d64652a948d72533023f6E7A623C7C53', // busd
  '0xD533a949740bb3306d119CC777fa900bA034cd52', // crv
  daiAddress, // dai
  '0xF629cBd94d3791C9250152BD8dfBDF380E2a3B9c', // enj
  '0x056fd409e1d7a124bd7017459dfea2f387b6d5cd', // gusd
  '0xdd974d5c2e2928dea5f71b9825b8b646686bd200', // knc
  '0x514910771af9ca656af840dff83e8264ecf986ca', // link
  '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942', // mana
  '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', // mkr
  '0x408e41876cCCDC0F92210600ef50372656052a38', // ren
  '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F', // snx
  '0x57Ab1ec28D129707052df4dF418D58a2D46d5f51', // susd
  '0x0000000000085d4780B73119b644AE5ecd22b376', // tusd
  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // uni
  usdcAddress, // usdc
  usdtAddress, // usdt
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // wbtc
  wethAddress, // weth
  '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e', // yfi
  '0xE41d2489571d322189246DaFA5ebDe1F4699F498', // zrx
];

const gst2 = '0x0000000000b3F879cb30FE243b4Dfee438691c04';
const uniswapRouter = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const sushiswapRouter = '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f';
const kyberProxy = '0x9AAb3f75489902f3a48495025729a0AF77d4b11e';
const aEth = '0x3a3A65aAb0dd2A17E3F1947bA16138cd37d08c04';
const aEthV2 = '0x030bA81f1c18d280636F32af80b9AAd02Cf0854e';
const cEth = '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5';
const compTroller = '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b';
const compTokens = [
  '0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e',
  '0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4',
  '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643',
  '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5',
  '0x158079ee67fce2f58472a96584a73c7ab9ac95c1',
  '0xf5dce57282a584d2746faf1593d3121fcac444dc',
  '0x35a18000230da775cac24873d00ff85bccded550',
  '0x39aa39c021dfbae8fac545936693ac917d5e7563',
  '0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9',
  '0xc11b1268c1a384e55c48c2391d8d480264a3a7f4',
  '0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407',
];
const lendingPoolV1 = '0x398eC7346DcD622eDc5ae82352F02bE94C62d119';
const lendingPoolCoreV1 = '0x3dfd23A6c5E8BbcFc9581d2E864a68feb6a076d3';
const lendingPoolV2 = '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9';
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

task('deploy', 'Deploys the SmartWallet contracts').setAction(async () => {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const deployContracts = [
    'BurnGasHelper',
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
    [deployerAddress, gst2],
    [deployerAddress],
    [deployerAddress],
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
    [daiAddress, usdcAddress, usdtAddress, wethAddress],
    [kyberProxy, uniswapRouter, sushiswapRouter],
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
  tx = await instance.updateBurnGasHelper(ADDRESSES['BurnGasHelper'], {
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
    lendingPoolV2,
    providerV2,
    lendingPoolV1,
    lendingPoolCoreV1,
    0,
    wethAddress,
    supportedTokens,
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
