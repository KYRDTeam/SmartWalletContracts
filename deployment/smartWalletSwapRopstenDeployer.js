const artifacts = require('hardhat').artifacts
const BN = web3.utils.BN;

const SmartWalletSwapImplementation = artifacts.require('SmartWalletSwapImplementation.sol');
const SmartWalletSwapProxy = artifacts.require('SmartWalletSwapProxy.sol');
const BurnGasHelper = artifacts.require('BurnGasHelper.sol');
const GasToken = artifacts.require('IGasToken.sol');
const IERC20Ext = artifacts.require('@kyber.network/utils-sc/contracts/IERC20Ext.sol');

const {ethAddress, emptyHint} = require('../test/helper');

let impl;
let implAddr;// = '0xee7bc68D3e86d1D058B37a6464C346A08b54Dd91';
let proxy;
let proxyAddr;// = '0x34302f0F9F5ca8bDB9A3e66f34E33DA483De6115';
let burnGasHelper;
let burnHelperAddr;// = '0xF2Ef10927F8df1862ead8411f076f566f4B71486';


let deployer;

const supportedTokens = [
    '0xbca556c912754bc8e7d4aad20ad69a1b1444f42d', // weth
    '0x7b2810576aa1cce68f2b118cef1f36467c648f92', // knc
    '0xad6d458402f60fd3bd25163575031acdce07538d', // dai
    '0xb4f7332ed719eb4839f091eddb2a3ba309739521', // link
    '0x3dff0dce5fc4b367ec91d31de3837cf3840c8284', // wbtc
]

const gst2 = '0x0000000000b3F879cb30FE243b4Dfee438691c04';
const uniswapRouter = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const kyberProxy = '0xd719c34261e099Fdb33030ac8909d5788D3039C4';

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
    impl = await SmartWalletSwapImplementation.new(
      deployer, kyberProxy, [], burnGasHelper.address
    );
    implAddr = impl.address;
    console.log(`Deployed implementation at ${impl.address}`);
  } else {
    impl = await SmartWalletSwapImplementation.at(implAddr);
    console.log(`Interacting implementation at ${impl.address}`);
  }

  if (proxyAddr == undefined) {
    proxy = await SmartWalletSwapProxy.new(deployer, impl.address);
    proxyAddr = proxy.address;
    console.log(`Deployed proxy at ${proxy.address}`);
  } else {
    proxy = await SmartWalletSwapProxy.at(proxyAddr);
    console.log(`Interacting proxy at ${proxy.address}`);
  }

  let swapProxy = await SmartWalletSwapImplementation.at(proxy.address);

  // approve allowance
  await swapProxy.approveAllowances(
    supportedTokens, [kyberProxy, uniswapRouter], false, { gasPrice: gasPrice }
  );
  console.log(`Approved allowances for proxy and uniswap router`);
  // update storage data
  await swapProxy.updateKyberProxy(kyberProxy, { gasPrice: gasPrice });
  console.log(`Updated kyber proxy`);
  await swapProxy.updateUniswapRouters([uniswapRouter], true, { gasPrice: gasPrice });
  console.log(`Added uniswap routers`);
  await swapProxy.updateSupportedPlatformWallets(supportedWallets, true, { gasPrice: gasPrice });
  console.log(`Added supported platform wallets`);

  for(let i = 0; i < supportedTokens.length; i++) {
    let token = await IERC20Ext.at(supportedTokens[i]);
    await token.approve(swapProxy.address, new BN(2).pow(new BN(255)), { gasPrice: gasPrice });
    console.log(`Approved allowances for token: ${supportedTokens[i]}`);
  }
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
