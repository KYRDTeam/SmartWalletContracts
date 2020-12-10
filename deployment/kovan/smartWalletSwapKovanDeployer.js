const artifacts = require('hardhat').artifacts
const BN = web3.utils.BN;

const SmartWalletSwapImplementation = artifacts.require('SmartWalletSwapImplementation.sol');
const SmartWalletLending = artifacts.require('SmartWalletLending.sol');
const SmartWalletSwapProxy = artifacts.require('SmartWalletSwapProxy.sol');
const BurnGasHelper = artifacts.require('BurnGasHelper.sol');
const GasToken = artifacts.require('IGasToken.sol');
const IERC20Ext = artifacts.require('@kyber.network/utils-sc/contracts/IERC20Ext.sol');

const {ethAddress, zeroAddress, emptyHint} = require('../../test/helper');

let burnGasHelper;
let burnHelperAddr = '0x06F6b7960222732a01A8ef42b42B7Ce03cB531B4';
let impl;
let implAddr = '0x522573A29A0349cFa98a02D3A8063f82aEF19C8f';
let lendingImpl;
let lendingAddr = '0x15a91A091648162a042bCEd9C9C407835fd779e9';
let proxy;
let proxyAddr = '0x4d20Ce084291b6e95954FaA55c687CedaC2a3411';


let deployer;

const supportedTokens = [
    '0xd0a1e359811322d97991e03f863a0c30c2cf029c', // weth
]

const gst2 = '0x0000000000004946c0e9f43f4dee607b0ef1fa1c'; // CHI token
const uniswapRouter = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'; // don't have
const kyberProxy = '0xd719c34261e099Fdb33030ac8909d5788D3039C4'; // don't have
const aEth = '0xD483B49F2d55D2c53D32bE6efF735cB001880F79';
const aEthV2 = '0xe2735Adf49D06fBC2C09D9c0CFfbA5EF5bA35649';
const cEth = '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5';
const comp = '0xc00e94cb662c3520282e6f5717214004a7f26888';
const comptroller = '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b';
const compTokens = [
    '0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e',
    '0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4',
    '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643',
    '0x39aa39c021dfbae8fac545936693ac917d5e7563'
  ]

const supportedWallets = [
  '0x3fFFF2F4f6C0831FAC59534694ACd14AC2Ea501b', // android
  '0x9a68f7330A3Fe9869FfAEe4c3cF3E6BBef1189Da', // ios
  '0x440bBd6a888a36DE6e2F6A25f65bc4e16874faa9', // web
]

async function main() {
  const accounts = await web3.eth.getAccounts();
  deployer = accounts[0];
  console.log(`Deployer address at ${deployer}`);

  gasPrice = new BN(2).mul(new BN(10).pow(new BN(9)));
  console.log(`Sending transactions with gas price: ${gasPrice.toString(10)} (${gasPrice.div(new BN(10).pow(new BN(9))).toString(10)} gweis)`);

  if (burnHelperAddr == undefined) {
    burnGasHelper = await BurnGasHelper.new(
      deployer, gst2, 14154, 6870, 24000
    );
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
    console.log(`Interacting lending implementation at ${lendingImpl.address}`);
  }

  if (proxyAddr == undefined) {
    proxy = await SmartWalletSwapProxy.new(deployer, impl.address);
    proxyAddr = proxy.address;
    console.log(`Deployed proxy at ${proxy.address}`);
  } else {
    proxy = await SmartWalletSwapProxy.at(proxyAddr);
    console.log(`Interacting proxy at ${proxy.address}`);
  }

  // await proxy.updateNewImplementation(impl.address);
  // console.log(`Updated implementation: ${impl.address}`);

  let swapProxy = await SmartWalletSwapImplementation.at(proxy.address);
  await swapProxy.updateLendingImplementation(lendingAddr);
  console.log(`Updated lending impl to proxy ${lendingAddr}`);
  await swapProxy.updateBurnGasHelper(burnGasHelper.address);
  console.log(`Updated burn gas helper for proxy`);
  await swapProxy.updateKyberProxy(kyberProxy, { gasPrice: gasPrice });
  console.log(`Updated kyber proxy`);
  await swapProxy.updateUniswapRouters([uniswapRouter], true, { gasPrice: gasPrice });
  console.log(`Added uniswap routers`);
  await swapProxy.updateSupportedPlatformWallets(supportedWallets, true, { gasPrice: gasPrice });
  console.log(`Added supported platform wallets`);

  await lendingImpl.updateAaveLendingPoolData(
    '0x9FE532197ad76c5a68961439604C037EB79681F0',
    zeroAddress,
    0,
    '0xd0a1e359811322d97991e03f863a0c30c2cf029c', // weth
    [ethAddress]
  );
  console.log(`Updated aave lending pool data to lending impl`);
  await lendingImpl.updateCompoundData(comptroller, cEth, compTokens);
  console.log(`Updated compound data to lending impl`);
  await lendingImpl.updateSwapImplementation(proxy.address);
  console.log(`Updated proxy to lending impl`)

  for(let i = 0; i < supportedTokens.length; i++) {
    let token = await IERC20Ext.at(supportedTokens[i]);
    await token.approve(swapProxy.address, new BN(2).pow(new BN(255)), { gasPrice: gasPrice });
    console.log(`Approved allowances for token: ${supportedTokens[i]}`);
  }

  let gasToken = await GasToken.at(gst2);
  await gasToken.mint(160);
  console.log(`Minted gas`)
  await gasToken.approve(swapProxy.address, new BN(2).pow(new BN(255)));
  console.log(`Approved gas token`)
  let kncAmount = new BN(10).pow(new BN(18));
  let kncToken = await IERC20Ext.at('0x7b2810576aa1cce68f2b118cef1f36467c648f92');
  await kncToken.approve(swapProxy.address, new BN(2).pow(new BN(255)), { gasPrice: gasPrice });
  console.log(`Approved knc`)
  let ethAmount = new BN(10).pow(new BN(15));
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
    { gas: 3000000 }
  );
  console.log(`Swap Kyber and deposit aave v1 gas used: ${tx1.receipt.gasUsed}`);
  
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
    { value: ethAmount, gas: 3000000 }
  );
  console.log(`Deposit aave v2 gas used: ${tx1.receipt.gasUsed}`);
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
    { gas: 3000000 }
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
    { value: ethAmount, gas: 3000000 }
  );
  console.log(`Deposit compound gas used: ${tx3.receipt.gasUsed}`);

  let aEthToken = await IERC20Ext.at(aEthV2);
  let aEthBalance = await aEthToken.balanceOf(deployer);
  let aEthAmount = aEthBalance.div(new BN(5));
  console.log(`aETH balance: ${aEthBalance.toString(10)}`);
  // await aEthToken.approve(swapProxy.address, new BN(2).pow(new BN(255)));
  let tx4 = await swapProxy.withdrawFromLendingPlatform(1, ethAddress, aEthAmount, new BN(0), true, { gas: 2000000 });
  console.log(`Withdraw eth from aave v2, gas used: ${tx4.receipt.gasUsed}`);

  let cEthToken = await IERC20Ext.at(cEth);
  let cEthBalance = await cEthToken.balanceOf(deployer);
  let cEthAmount = cEthBalance.div(new BN(5));
  console.log(`cETH balance: ${cEthBalance.toString(10)}`);
  await cEthToken.approve(swapProxy.address, new BN(2).pow(new BN(255)));
  tx4 = await swapProxy.withdrawFromLendingPlatform(2, ethAddress, cEthAmount, new BN(0), true, { gas: 2000000 });
  console.log(`Withdraw eth from compound, gas used: ${tx4.receipt.gasUsed}`);

  let tx5 = await swapProxy.claimComp([deployer], [], true, true, true, { gas: 2000000 });
  console.log(`Claim comp gas used: ${tx5.receipt.gasUsed}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
