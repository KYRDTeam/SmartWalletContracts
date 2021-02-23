const {
  ethAddress,
  usdtAddress,
  uniswapRouter,
  aUsdtV1Address,
  aUsdtV2Address,
  cUsdtAddress,
  comptroller,
  cEthAddress,
  aEthV2Address
} = require('./helper');

const gasTokenAddress = '0x0000000000b3F879cb30FE243b4Dfee438691c04';
const kyberProxyAddress = "0x9AAb3f75489902f3a48495025729a0AF77d4b11e";
const sushiswapRouter = '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f';
const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f';
const weth = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const aavePoolV1Address = '0x398eC7346DcD622eDc5ae82352F02bE94C62d119';
const aavePoolV2Address = '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9';
const aavePoolCoreV1Address = '0x3dfd23A6c5E8BbcFc9581d2E864a68feb6a076d3';
const aEthV1Address = '0x3a3a65aab0dd2a17e3f1947ba16138cd37d08c04';

module.exports.setupBeforeTest = async (
  accounts,
  IERC20Ext,
  GasToken,
  SmartWalletSwapImplementation,
  BurnGasHelper,
  SmartWalletLending,
  SmartWalletSwapProxy,
  BN
) => {
  let user = accounts[0];
  let admin = accounts[0];
  let burnGasHelper = await BurnGasHelper.new(admin, gasTokenAddress);

  let lending = await SmartWalletLending.new(admin);
  let swapImplementation = await SmartWalletSwapImplementation.new(admin);
  let swapProxy = await SmartWalletSwapProxy.new(
    admin,
    swapImplementation.address,
    kyberProxyAddress,
    [uniswapRouter, sushiswapRouter]
  );
  swapProxy = await SmartWalletSwapImplementation.at(swapProxy.address);

  await swapProxy.approveAllowances(
    [weth, usdtAddress, usdcAddress, daiAddress], [kyberProxyAddress, uniswapRouter, sushiswapRouter], false, { from: admin }
  );
  await swapProxy.updateLendingImplementation(lending.address, { from: admin });
  await swapProxy.updateSupportedPlatformWallets([user], true, { from: admin });
  await swapProxy.updateBurnGasHelper(burnGasHelper.address, { from: admin });
  await lending.updateSwapImplementation(swapProxy.address, { from: admin });
  await lending.updateAaveLendingPoolData(
    aavePoolV2Address,
    aavePoolV1Address,
    aavePoolCoreV1Address,
    0,
    weth,
    [ethAddress, usdtAddress], { from: admin }
  );
  await lending.updateCompoundData(comptroller, cEthAddress, [cUsdtAddress], { from: admin });

  let gasToken = await GasToken.at(gasTokenAddress);
  let aEthV1Token = await IERC20Ext.at(aEthV1Address);
  let aEthV2Token = await IERC20Ext.at(aEthV2Address);
  let aUsdtV1Token = await IERC20Ext.at(aUsdtV1Address);
  let aUsdtV2Token = await IERC20Ext.at(aUsdtV2Address);
  let cEthToken = await IERC20Ext.at(cEthAddress);
  let cUsdtToken = await IERC20Ext.at(cUsdtAddress);
  const lendingUsdtTokensByPlatform = [aUsdtV1Token, aUsdtV2Token, cUsdtToken];
  const lendingEthTokensByPlatform = [aEthV1Token, aEthV2Token, cEthToken];

  let tokenAddresses = [
    gasTokenAddress, usdtAddress, usdcAddress, daiAddress, aEthV1Address,
    aEthV2Address, aUsdtV1Address, aUsdtV2Address, cUsdtAddress, cEthAddress
  ];

  for (let i = 0; i < tokenAddresses.length; i++) {
    let token = await IERC20Ext.at(tokenAddresses[i]);
    await token.approve(swapProxy.address, new BN(2).pow(new BN(255)), { from: user });
  }

  swapProxy = await SmartWalletSwapImplementation.at(swapProxy.address);

  return { user, lending, swapImplementation, swapProxy, burnGasHelper, gasToken, aEthV1Token, aUsdtV1Token,
    aUsdtV2Token, cUsdtToken, lendingUsdtTokensByPlatform, aEthV2Token, lendingEthTokensByPlatform }
}

module.exports.setupBeforeEachTest = async (gasToken, user) => {
  await gasToken.mint(100);
  await gasToken.mint(100);
  await gasToken.mint(100);
  await gasToken.transfer(user, 300);
}