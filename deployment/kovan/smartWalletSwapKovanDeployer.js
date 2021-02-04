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
let burnHelperAddr = '0x26D4BE7D7Ea7359a69d26AE5036290748077428D';
let impl;
let implAddr = '0xd351C91a265826E8E77aC5a3585b86d7d14d3b11';
let lendingImpl;
let lendingAddr = '0x7Fbe27e8Fae895C87e18B43E5Acd2BFF0856e937';
let proxy;
let proxyAddr = '0x8746BE0c8Aa9eE75e31182f5c233eCb66C566591';


let deployer;

const supportedTokens = [
    '0xd0a1e359811322d97991e03f863a0c30c2cf029c', // weth
]

const gst2 = '0x0000000000004946c0e9f43f4dee607b0ef1fa1c'; // CHI token
const uniswapRouter = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'; // don't have
const kyberProxy = '0xd719c34261e099Fdb33030ac8909d5788D3039C4'; // don't have
const aEth = '0xD483B49F2d55D2c53D32bE6efF735cB001880F79';
const aEthV2 = '0x87b1f4cf9bd63f7bbd3ee1ad04e8f52540349347';
const cEth = '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72';
const comp = '0x61460874a7196d6a22d1ee4922473664b3e95270';
const comptroller = '0x5eae89dc1c671724a672ff0630122ee834098657';
const compTokens = [
    '0xf0d0eb522cfa50b716b3b1604c4f0fa6f04376ad', // cdai
    '0x4a92e71227d294f041bd82dd8f78591b75140d63', // cusdc
    '0x3f0a0ea2f86bae6362cf9799b523ba06647da018' // cusdt
  ]
const lendingPoolCoreV1 = "0x95D1189Ed88B380E319dF73fF00E479fcc4CFa45";
const lendingPoolV1 = "0x580D4Fdc4BF8f9b5ae2fb9225D584fED4AD5375c";
const lendingPoolV2 = "0xE0fBa4Fc209b4948668006B2bE61711b7f465bAe";

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
    console.log(`Interacting lending implementation at ${lendingImpl.address}`);
  }

  if (proxyAddr == undefined) {
    proxy = await SmartWalletSwapProxy.new(deployer, impl.address, kyberProxy, [uniswapRouter]);
    proxyAddr = proxy.address;
    console.log(`Deployed proxy at ${proxy.address}`);
  } else {
    proxy = await SmartWalletSwapProxy.at(proxyAddr);
    console.log(`Interacting proxy at ${proxy.address}`);
  }

  let swapProxy = await SmartWalletSwapImplementation.at(proxy.address);
  // await swapProxy.updateLendingImplementation(lendingAddr);
  // console.log(`Updated lending impl to proxy ${lendingAddr}`);
  // await swapProxy.updateBurnGasHelper(burnGasHelper.address);
  // console.log(`Updated burn gas helper for proxy`);
  // await swapProxy.updateSupportedPlatformWallets(supportedWallets, true, { gasPrice: gasPrice });
  // console.log(`Added supported platform wallets`);

  await lendingImpl.updateAaveLendingPoolData(
    lendingPoolV2,
    lendingPoolV1,
    lendingPoolCoreV1,
    0,
    '0xd0a1e359811322d97991e03f863a0c30c2cf029c', // weth
    [
      ethAddress,
      "0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD", // dai
      "0xe22da380ee6B445bb8273C81944ADEB6E8450422", // usdc
      "0x3F80c39c0b96A0945f9F0E9f55d8A8891c5671A8", // knc
    ]
  );
  console.log(`Updated aave lending pool data to lending impl`);
  // await lendingImpl.updateCompoundData(comptroller, cEth, compTokens);
  // console.log(`Updated compound data to lending impl`);
  // await lendingImpl.updateSwapImplementation(proxy.address);
  // console.log(`Updated proxy to lending impl`)

  // for(let i = 0; i < supportedTokens.length; i++) {
  //   let token = await IERC20Ext.at(supportedTokens[i]);
  //   await token.approve(swapProxy.address, new BN(2).pow(new BN(255)), { gasPrice: gasPrice });
  //   console.log(`Approved allowances for token: ${supportedTokens[i]}`);
  // }

  // let gasToken = await GasToken.at(gst2);
  // await gasToken.mint(160);
  // console.log(`Minted gas`)
  // await gasToken.approve(swapProxy.address, new BN(2).pow(new BN(255)));
  // console.log(`Approved gas token`)
  // let kncAmount = new BN(10).pow(new BN(18));
  // let kncToken = await IERC20Ext.at('0x7b2810576aa1cce68f2b118cef1f36467c648f92');
  // await kncToken.approve(swapProxy.address, new BN(2).pow(new BN(255)), { gasPrice: gasPrice });
  // console.log(`Approved knc`)
  let ethAmount = new BN(10).pow(new BN(15));
  let tx;
  // tx = await swapProxy.swapKyberAndDeposit(
  //   0, // aave v1
  //   ethAddress,
  //   ethAddress,
  //   ethAmount,
  //   new BN(0),
  //   8,
  //   supportedWallets[0],
  //   emptyHint,
  //   true,
  //   { value: ethAmount, gas: 3000000 }
  // );
  // console.log(`Swap Kyber and deposit aave v1 gas used: ${tx.receipt.gasUsed}`);
  // tx = await swapProxy.swapKyberAndDeposit(
  //   0, // aave v1
  //   ethAddress,
  //   ethAddress,
  //   ethAmount,
  //   new BN(0),
  //   8,
  //   supportedWallets[0],
  //   emptyHint,
  //   true,
  //   { value: ethAmount, gas: 3000000 }
  // );
  // console.log(`Deposit aave v1 gas used: ${tx.receipt.gasUsed}`);
  tx = await swapProxy.swapKyberAndDeposit(
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
  console.log(`Deposit aave v2 gas used: ${tx.receipt.gasUsed}`);
  // let tx3 = await swapProxy.swapKyberAndDeposit(
  //   2, //compound
  //   kncToken.address,
  //   ethAddress,
  //   kncAmount,
  //   new BN(0),
  //   8,
  //   supportedWallets[0],
  //   emptyHint,
  //   true,
  //   { gas: 3000000 }
  // );
  // console.log(`Swap Kyber and deposit compound gas used: ${tx3.receipt.gasUsed}`);
  // ethAmount = new BN(10).pow(new BN(16));
  // tx = await swapProxy.swapKyberAndDeposit(
  //   2, //compound
  //   ethAddress,
  //   ethAddress,
  //   ethAmount,
  //   new BN(0),
  //   8,
  //   supportedWallets[0],
  //   emptyHint,
  //   true,
  //   { value: ethAmount, gas: 3000000 }
  // );
  // console.log(`Deposit compound gas used: ${tx.receipt.gasUsed}`);

  let aEthToken = await IERC20Ext.at(aEthV2);
  let aEthBalance = await aEthToken.balanceOf(deployer);
  let aEthAmount = aEthBalance.div(new BN(5));
  console.log(`aETH balance: ${aEthBalance.toString(10)}`);
  // await aEthToken.approve(swapProxy.address, new BN(2).pow(new BN(255)));
  tx = await swapProxy.withdrawFromLendingPlatform(1, ethAddress, aEthAmount, new BN(0), true, { gas: 2000000 });
  console.log(`Withdraw eth from aave v2, gas used: ${tx.receipt.gasUsed}`);

  // let cEthToken = await IERC20Ext.at(cEth);
  // let cEthBalance = await cEthToken.balanceOf(deployer);
  // let cEthAmount = cEthBalance.div(new BN(5));
  // console.log(`cETH balance: ${cEthBalance.toString(10)}`);
  // await cEthToken.approve(swapProxy.address, new BN(2).pow(new BN(255)));
  // tx = await swapProxy.withdrawFromLendingPlatform(2, ethAddress, cEthAmount, new BN(0), true, { gas: 2000000 });
  // console.log(`Withdraw eth from compound, gas used: ${tx.receipt.gasUsed}`);

  // tx = await swapProxy.claimComp([deployer], [], true, true, true, { gas: 2000000 });
  // console.log(`Claim comp gas used: ${tx.receipt.gasUsed}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
