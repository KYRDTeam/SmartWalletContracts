const AaveLendingPoolV1 = artifacts.require('IAaveLendingPoolV1.sol');
const AaveLendingPoolV2 = artifacts.require('IAaveLendingPoolV2.sol');
const Provider = artifacts.require('IProtocolDataProvider.sol');
const CompoundPool = artifacts.require('IComptroller.sol');
const ICompErc20 = artifacts.require('ICompErc20.sol');
const IERC20Ext = artifacts.require('@kyber.network/utils-sc/contracts/IERC20Ext.sol');
const SmartWalletSwapImplementation = artifacts.require('SmartWalletSwapImplementation.sol');
const SmartWalletSwapProxy = artifacts.require('SmartWalletSwapProxy.sol');
const SmartWalletLending = artifacts.require('SmartWalletLending.sol');
const BurnGasHelper = artifacts.require('BurnGasHelper.sol');
const GasToken = artifacts.require('IGasToken.sol');
const WETH = artifacts.require('IWeth.sol');
const BN = web3.utils.BN;

const {
  evm_snapshot,
  fundWallet,
  ethAddress,
  ethDecimals,
  daiAddress,
  usdtAddress,
  usdcAddress,
  wethAddress,
  kyberProxyAddress,
  uniswapRouter,
  sushiswapRouter,
  gasTokenAddress,
  AAVE_V1_ADDRESSES,
  AAVE_V2_ADDRESSES,
  COMPOUND_ADDRESSES,
  MAX_ALLOWANCE,
} = require('./helper');

module.exports.setupBeforeTest = async (accounts) => {
  let user = accounts[0];
  let admin = accounts[0];
  let burnGasHelper = await BurnGasHelper.new(admin, gasTokenAddress);

  let lending = await SmartWalletLending.new(admin);
  let swapImplementation = await SmartWalletSwapImplementation.new(admin);
  let swapProxy = await SmartWalletSwapProxy.new(admin, swapImplementation.address, kyberProxyAddress, [
    uniswapRouter,
    sushiswapRouter,
  ]);
  swapProxy = await SmartWalletSwapImplementation.at(swapProxy.address);

  // approve allowance
  await swapProxy.approveAllowances(
    [wethAddress, usdtAddress, usdcAddress, daiAddress],
    [kyberProxyAddress, uniswapRouter, sushiswapRouter],
    false,
    {from: admin}
  );

  // update storage data
  await swapProxy.updateLendingImplementation(lending.address, {from: admin});
  await swapProxy.updateSupportedPlatformWallets([user], true, {from: admin});
  await swapProxy.updateBurnGasHelper(burnGasHelper.address, {from: admin});
  await lending.updateSwapImplementation(swapProxy.address, {from: admin});
  await lending.updateAaveLendingPoolData(
    AAVE_V2_ADDRESSES.aavePoolV2Address,
    AAVE_V2_ADDRESSES.aaveProviderV2Address,
    AAVE_V1_ADDRESSES.aavePoolV1Address,
    AAVE_V1_ADDRESSES.aavePoolCoreV1Address,
    0,
    wethAddress,
    [ethAddress, wethAddress, daiAddress, usdtAddress],
    {from: admin}
  );
  await lending.updateCompoundData(
    COMPOUND_ADDRESSES.comptroller,
    COMPOUND_ADDRESSES.cEthAddress,
    [COMPOUND_ADDRESSES.cUsdtAddress, COMPOUND_ADDRESSES.cDaiAddress],
    {from: admin}
  );

  let aaveV1Pool = await AaveLendingPoolV1.at(AAVE_V1_ADDRESSES.aavePoolV1Address);
  let aaveV2Pool = await AaveLendingPoolV2.at(AAVE_V2_ADDRESSES.aavePoolV2Address);
  let compoundPool = await CompoundPool.at(COMPOUND_ADDRESSES.comptroller);
  let gasToken = await GasToken.at(gasTokenAddress);
  let aEthV1Token = await IERC20Ext.at(AAVE_V1_ADDRESSES.aEthAddress);
  let aEthV2Token = await IERC20Ext.at(AAVE_V2_ADDRESSES.aWethAddress);
  let aUsdtV1Token = await IERC20Ext.at(AAVE_V1_ADDRESSES.aUsdtAddress);
  let aUsdtV2Token = await IERC20Ext.at(AAVE_V2_ADDRESSES.aUsdtAddress);
  let cEthToken = await IERC20Ext.at(COMPOUND_ADDRESSES.cEthAddress);
  let cUsdtToken = await IERC20Ext.at(COMPOUND_ADDRESSES.cUsdtAddress);
  let cDaiToken = await ICompErc20.at(COMPOUND_ADDRESSES.cDaiAddress);

  const lendingUsdtTokensByPlatform = [aUsdtV1Token, aUsdtV2Token, cUsdtToken];
  const lendingEthTokensByPlatform = [aEthV1Token, aEthV2Token, cEthToken];

  let tokenAddresses = [
    gasTokenAddress,
    usdtAddress,
    usdcAddress,
    daiAddress,
    AAVE_V1_ADDRESSES.aEthAddress,
    AAVE_V2_ADDRESSES.aWethAddress,
    AAVE_V1_ADDRESSES.aUsdtAddress,
    AAVE_V2_ADDRESSES.aUsdtAddress,
    AAVE_V1_ADDRESSES.aDaiAddress,
    AAVE_V2_ADDRESSES.aDaiAddress,
    COMPOUND_ADDRESSES.cUsdtAddress,
    COMPOUND_ADDRESSES.cEthAddress,
  ];

  for (let i = 0; i < tokenAddresses.length; i++) {
    let token = await IERC20Ext.at(tokenAddresses[i]);
    await token.approve(swapProxy.address, new BN(2).pow(new BN(255)), {from: user});
  }

  swapProxy = await SmartWalletSwapImplementation.at(swapProxy.address);

  let aUsdtToken = await IERC20Ext.at(AAVE_V1_ADDRESSES.aUsdtAddress);
  await aUsdtToken.approve(swapProxy.address, MAX_ALLOWANCE, {from: user});
  aUsdtToken = await IERC20Ext.at(AAVE_V2_ADDRESSES.aUsdtAddress);
  await aUsdtToken.approve(swapProxy.address, MAX_ALLOWANCE, {from: user});

  // fund testing wallet with USDT, USDC, and DAI
  const usdtToken = await IERC20Ext.at(usdtAddress);
  const usdcToken = await IERC20Ext.at(usdcAddress);
  const daiToken = await IERC20Ext.at(daiAddress);
  await fundWallet(user, usdtToken, '10000');
  await fundWallet(user, usdcToken, '10000');
  await fundWallet(user, daiToken, '10000');

  // fund testing wallet with WETH
  const wethToken = await WETH.at(wethAddress);
  await wethToken.deposit({value: new BN('100').mul(new BN(10).pow(ethDecimals))});

  snapshotId = await evm_snapshot();

  return {
    user,
    lending,
    swapImplementation,
    swapProxy,
    burnGasHelper,
    gasToken,
    aEthV1Token,
    aUsdtV1Token,
    aUsdtV2Token,
    cUsdtToken,
    lendingUsdtTokensByPlatform,
    aEthV2Token,
    lendingEthTokensByPlatform,
    aaveV1Pool,
    aaveV2Pool,
    compoundPool,
    cDaiToken,
    snapshotId,
  };
};

module.exports.setupBeforeEachTest = async (gasToken, user) => {
  await gasToken.mint(100);
  await gasToken.mint(100);
  await gasToken.mint(100);
  await gasToken.transfer(user, 300);
};
