const IERC20Ext = artifacts.require('@kyber.network/utils-sc/contracts/IERC20Ext.sol');
const SmartWalletSwapImplementation = artifacts.require('SmartWalletSwapImplementation.sol');
const SmartWalletSwapProxy = artifacts.require('SmartWalletSwapProxy.sol');
const SmartWalletLending = artifacts.require('SmartWalletLending.sol');
const BurnGasHelper = artifacts.require('BurnGasHelper.sol');
const GasToken = artifacts.require('IGasToken.sol');

const BN = web3.utils.BN;

const { expectEvent } = require('@openzeppelin/test-helpers');

const {
  emptyHint,
  ethAddress,
  usdtAddress,
  ethDecimals,
  lendingPlatforms,
  uniswapRouter,
  assertTxSuccess,
  assertLesser,
  assertGreaterOrEqual
} = require('./helper');

const {
  setupBeforeTest,
  setupBeforeEachTest
} = require('./setupTestingEnvironment');

let aaveV1Pool;
let lending;
let swapImplementation;
let swapProxy;
let burnGasHelper;
let user;
let gasToken;
let aEthV1Token;
let aUsdtV1Token;
let aUsdtV2Token;
let cUsdtToken;
let lendingUsdtTokensByPlatform;
let lendingEthTokensByPlatform;

contract('SmartWalletSwapImplementation', accounts => {
  before('setup testing environment', async () => {
    const result = await setupBeforeTest(
      accounts,
      IERC20Ext,
      GasToken,
      SmartWalletSwapImplementation,
      BurnGasHelper,
      SmartWalletLending,
      SmartWalletSwapProxy,
      BN
    )

    user = result.user;
    lending = result.lending;
    swapImplementation = result.swapImplementation;
    swapProxy = result.swapProxy;
    burnGasHelper = result.burnGasHelper;
    gasToken = result.gasToken;
    aEthV1Token = result.aEthV1Token;
    aUsdtV1Token = result.aUsdtV1Token;
    aUsdtV2Token = result.aUsdtV2Token;
    cUsdtToken = result.cUsdtToken;
    lendingUsdtTokensByPlatform = result.lendingUsdtTokensByPlatform;
    lendingEthTokensByPlatform = result.lendingEthTokensByPlatform;
    aaveV1Pool = result.aaveV1Pool;
  });

  beforeEach('mint gas token and transfer to user', async () => {
    await setupBeforeEachTest(gasToken, user);
  });

  describe('test swap and repay', async () => {
    it('should be able to repay the debt through Kyber', async () => {
      const srcAmount = new BN(5).pow(ethDecimals);
      const swapTradePath = [ethAddress, depositToken.address];

      // deposit usdt
      await swapProxy.swapUniswapAndDeposit(
        0, uniswapRouter, srcAmount, 0, swapTradePath, 8, user, false,
        { from: user, value: srcAmount }
      );

      // borrow
      await aaveV1Pool.borrow(
        _reserve, _amount, _interestRateMode, _referralCode,
        { from: user }
      );

      // swapandrepay
      const txWithoutGasToken = await swapProxy.swapKyberAndRepay(
        0, ethAddress, usdtAddress, srcAmount, payAmount, feeAndRateMode, user, emptyHint, false,
        { from: user, value: srcAmount }
      );
    });
  })
});
