const artifacts = require('hardhat').artifacts;
const BN = web3.utils.BN;

const SmartWalletSwapImplementation = artifacts.require('SmartWalletSwapImplementation.sol');
const SmartWalletLending = artifacts.require('SmartWalletLending.sol');
const SmartWalletSwapProxy = artifacts.require('SmartWalletSwapProxy.sol');
const BurnGasHelper = artifacts.require('BurnGasHelper.sol');
const GasToken = artifacts.require('IGasToken.sol');
const IERC20Ext = artifacts.require('@kyber.network/utils-sc/contracts/IERC20Ext.sol');

const {
  ethAddress,
  zeroAddress,
  emptyHint,
  wethAddress,
  kyberProxyAddress,
  daiAddress,
  usdcAddress,
  usdtAddress,
} = require('../../test/helper');

let impl;
let implAddr;
let proxy;
let proxyAddr;
let burnGasHelper;
let burnHelperAddr;
let lendingImpl;
let lendingAddr;

let deployer;

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

async function main() {
  const accounts = await web3.eth.getAccounts();
  deployer = accounts[0];
  console.log(`Deployer address at ${deployer}`);

  gasPrice = new BN(2).mul(new BN(10).pow(new BN(9)));
  console.log(
    `Sending transactions with gas price: ${gasPrice.toString(10)} (${gasPrice
      .div(new BN(10).pow(new BN(9)))
      .toString(10)} gweis)`
  );

  if (burnHelperAddr == undefined) {
    burnGasHelper = await BurnGasHelper.new(deployer, gst2);
    burnHelperAddr = burnGasHelper.address;
    console.log(`Deployed burn helper at ${burnHelperAddr}`);
  } else {
    burnGasHelper = await BurnGasHelper.at(burnHelperAddr);
    console.log(`Interacting burn helper at ${burnHelperAddr}`);
  }

  if (implAddr == undefined) {
    impl = await SmartWalletSwapImplementation.new(deployer);
    implAddr = impl.address;
    console.log(`Deployed swap implementation at ${impl.address}`);
  } else {
    impl = await SmartWalletSwapImplementation.at(implAddr);
    console.log(`Interacting swap implementation at ${impl.address}`);
  }

  if (lendingAddr == undefined) {
    lendingImpl = await SmartWalletLending.new(deployer);
    lendingAddr = lendingImpl.address;
    console.log(`Deployed lending implementation at ${lendingAddr}`);
  } else {
    lendingImpl = await SmartWalletLending.at(lendingAddr);
    console.log(`Interacting swap implementation at ${lendingImpl.address}`);
  }

  if (proxyAddr == undefined) {
    proxy = await SmartWalletSwapProxy.new(deployer, impl.address, kyberProxyAddress, [
      uniswapRouter,
      sushiswapRouter,
    ]);
    proxyAddr = proxy.address;
    console.log(`Deployed proxy at ${proxy.address}`);
  } else {
    proxy = await SmartWalletSwapProxy.at(proxyAddr);
    console.log(`Interacting proxy at ${proxy.address}`);
    await proxy.updateNewImplementation(impl.address);
    console.log(`Updated implementation: ${impl.address}`);
  }

  /// Contracts setup

  let swapProxy = await SmartWalletSwapImplementation.at(proxy.address);

  await swapProxy.approveAllowances(
    [wethAddress, usdtAddress, usdcAddress, daiAddress],
    [kyberProxyAddress, uniswapRouter, sushiswapRouter],
    false
  );
  console.log(
    `Approved allowances to Kyber ${kyberProxyAddress} and Uniswap routers [${uniswapRouter}, ${sushiswapRouter}]`
  );

  await swapProxy.updateLendingImplementation(lendingAddr);
  console.log(`Updated lending impl to proxy ${lendingAddr}`);
  await swapProxy.updateBurnGasHelper(burnGasHelper.address);
  console.log(`Updated burn gas helper for proxy`);
  await swapProxy.updateSupportedPlatformWallets(supportedWallets, true, {gasPrice: gasPrice});
  console.log(`Added supported platform wallets`);

  await lendingImpl.updateAaveLendingPoolData(
    lendingPoolV2,
    providerV2,
    lendingPoolV1,
    lendingPoolCoreV1,
    0,
    wethAddress,
    supportedTokens
  );
  console.log(`Updated aave lending pool data to lending impl`);
  await lendingImpl.updateCompoundData(compTroller, cEth, compTokens);
  console.log(`Updated compound data to lending impl`);
  await lendingImpl.updateSwapImplementation(proxy.address);
  console.log(`Updated proxy to lending impl`);

  /// Test deployment

  for (let i = 0; i < supportedTokens.length; i++) {
    let token = await IERC20Ext.at(supportedTokens[i]);
    await token.approve(swapProxy.address, new BN(2).pow(new BN(255)), {gasPrice: gasPrice});
    console.log(`Approved allowances for token: ${supportedTokens[i]}`);
  }

  let gasToken = await GasToken.at(gst2);
  await gasToken.mint(160);
  console.log(`Minted gas`);
  await gasToken.approve(swapProxy.address, new BN(2).pow(new BN(255)));
  console.log(`Approved gas token`);
  let kncAmount = new BN(10).pow(new BN(18));
  let kncToken = await IERC20Ext.at('0x7b2810576aa1cce68f2b118cef1f36467c648f92');
  await kncToken.approve(swapProxy.address, new BN(2).pow(new BN(255)), {gasPrice: gasPrice});
  console.log(`Approved knc`);

  let tx1 = await swapProxy.swapKyberAndDeposit(
    0, // aave v1
    kncToken.address,
    ethAddress,
    kncAmount,
    new BN(0),
    8,
    supportedWallets[0],
    emptyHint,
    true,
    {gas: 3000000}
  );
  console.log(`Swap Kyber and deposit aave v1 gas used: ${tx1.receipt.gasUsed}`);
  let ethAmount = new BN(10).pow(new BN(16));
  tx1 = await swapProxy.swapKyberAndDeposit(
    1, // aave v2
    ethAddress,
    ethAddress,
    ethAmount,
    new BN(0),
    8,
    supportedWallets[0],
    emptyHint,
    true,
    {value: ethAmount, gas: 3000000}
  );
  console.log(`Deposit aave v1 gas used: ${tx1.receipt.gasUsed}`);
  let tx3 = await swapProxy.swapKyberAndDeposit(
    2, //compound
    kncToken.address,
    ethAddress,
    kncAmount,
    new BN(0),
    8,
    supportedWallets[0],
    emptyHint,
    true,
    {gas: 3000000}
  );
  console.log(`Swap Kyber and deposit compound gas used: ${tx3.receipt.gasUsed}`);
  ethAmount = new BN(10).pow(new BN(16));
  tx3 = await swapProxy.swapKyberAndDeposit(
    2, //compound
    ethAddress,
    ethAddress,
    ethAmount,
    new BN(0),
    8,
    supportedWallets[0],
    emptyHint,
    true,
    {value: ethAmount, gas: 3000000}
  );
  console.log(`Deposit compound gas used: ${tx3.receipt.gasUsed}`);

  let tx4;
  // let aEthToken2 = await IERC20Ext.at(aEthV2);
  // let aEthBalance2 = await aEthToken2.balanceOf(deployer);
  // let aEthAmount2 = aEthBalance2.div(new BN(5));
  // console.log(`aETH balance: ${aEthBalance2.toString(10)}`);
  // await aEthToken2.approve(swapProxy.address, new BN(2).pow(new BN(255)));
  // tx4 = await swapProxy.withdrawFromLendingPlatform(0, ethAddress, aEthAmount2, new BN(0), true, { gas: 2000000 });
  // console.log(`Withdraw eth from aave v2, gas used: ${tx4.receipt.gasUsed}`);

  let aEthToken = await IERC20Ext.at(aEth);
  let aEthBalance = await aEthToken.balanceOf(deployer);
  let aEthAmount = aEthBalance.div(new BN(5));
  console.log(`aETH balance: ${aEthBalance.toString(10)}`);
  await aEthToken.approve(swapProxy.address, new BN(2).pow(new BN(255)));
  tx4 = await swapProxy.withdrawFromLendingPlatform(0, ethAddress, aEthAmount, new BN(0), true, {gas: 2000000});
  console.log(`Withdraw eth from aave v1, gas used: ${tx4.receipt.gasUsed}`);

  let cEthToken = await IERC20Ext.at(cEth);
  let cEthBalance = await cEthToken.balanceOf(deployer);
  let cEthAmount = cEthBalance.div(new BN(5));
  console.log(`cETH balance: ${cEthBalance.toString(10)}`);
  await cEthToken.approve(swapProxy.address, new BN(2).pow(new BN(255)));
  tx4 = await swapProxy.withdrawFromLendingPlatform(2, ethAddress, cEthAmount, new BN(0), true, {gas: 2000000});
  console.log(`Withdraw eth from compound, gas used: ${tx4.receipt.gasUsed}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
