const { expectEvent } = require('@openzeppelin/test-helpers');
const BN = web3.utils.BN;

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
    const result = await setupBeforeTest(accounts)

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
  });

  beforeEach('mint gas token and transfer to user', async () => {
    await setupBeforeEachTest(gasToken, user);
  });

  describe('test swapUniswapAndDeposit', async () => {
    it('should burn gas token and reduce gas used', async () => {
      const srcAmount = new BN(5).pow(ethDecimals);
      const swapTradePath = [ethAddress];
      const gasTokenBalanceBefore = await gasToken.balanceOf(user);

      const txWithoutGasToken = await swapProxy.swapUniswapAndDeposit(
        0, uniswapRouter, srcAmount, 0, swapTradePath, 8, user, false,
        { from: user, value: srcAmount }
      );

      const txWithGasToken = await swapProxy.swapUniswapAndDeposit(
        0, uniswapRouter, srcAmount, 0, swapTradePath, 8, user, true,
        { from: user, value: srcAmount }
      );

      const gasTokenBalanceAfter = await gasToken.balanceOf(user);

      assertLesser(txWithoutGasToken.receipt.gasUsed, txWithGasToken.receipt.gasUsed, '');
      assertLesser(gasTokenBalanceAfter, gasTokenBalanceBefore, '');
    });

    it('should take fee and directly deposit ETH to AAVE v1 + v2 + Compound', async () => {
      const bps = 8;
      const srcAmount = new BN(5).pow(ethDecimals);
      const swapTradePath = [ethAddress];

      for (let i = 0; i < lendingPlatforms.length; i++) {
        const tx = await swapProxy.swapUniswapAndDeposit(
          i, uniswapRouter, srcAmount, 0, swapTradePath, bps, user, false,
          { from: user, value: srcAmount }
        );
        assertTxSuccess(tx);

        const aTokenBalance = await aEthV1Token.balanceOf(user);
        const stakedAmount = srcAmount.sub(srcAmount.mul(new BN(bps)).div(new BN(10000)));

        assertGreaterOrEqual(aTokenBalance, stakedAmount);
      }
    });

    it('should swap ETH to token and deposit token to AAVE v1 + v2 + Compound, and then be able to withdraw from it', async () => {
      const srcAmount = new BN(5).pow(ethDecimals);
      const swapTradePath = [ethAddress, usdtAddress];

      for (let i = 0; i < lendingPlatforms.length; i++) {
        const usdtToken = lendingUsdtTokensByPlatform[i];

        const tx = await swapProxy.swapUniswapAndDeposit(
          i, uniswapRouter, srcAmount, 0, swapTradePath, 8, user, false,
          { from: user, value: srcAmount }
        );

        assertTxSuccess(tx);

        const aTokenBalance = await usdtToken.balanceOf(user);
        const destAmount = tx.logs[0].args.destAmount;

        assertGreaterOrEqual(aTokenBalance, destAmount);

        /** Withdraw from lending platform **/
        const withdrawReceipt = await swapProxy.withdrawFromLendingPlatform(
          i, usdtAddress, aTokenBalance, 0, false,
          { from: user }
        );

        expectEvent(withdrawReceipt, 'WithdrawFromLending', {
          platform: i.toString(),
          token: usdtAddress,
          amount: aTokenBalance
        });
      }
    });

    it('should swap token to ETH and deposit ETH to AAVE v1 + v2 + Compound', async () => {
      /** Swap ETH to token for testing **/
      const ethAmount = new BN(10).pow(ethDecimals);
      const tradePath = [ethAddress, usdtAddress];
      await swapProxy.swapUniswap(
        uniswapRouter, ethAmount, 0, tradePath, user, 8, user, true, false, { from: user, value: ethAmount }
      );

      /** Swap token to ETH and deposit **/
      const srcAmount = new BN(10).pow(new BN(6));
      const swapTradePath = [usdtAddress, ethAddress];

      for (let i = 0; i < lendingPlatforms.length; i++) {
        const ethToken = lendingEthTokensByPlatform[i];

        const tx = await swapProxy.swapUniswapAndDeposit(
          i, uniswapRouter, srcAmount, 0, swapTradePath, 8, user, false,
          { from: user }
        );
        assertTxSuccess(tx);

        const destAmount = tx.logs[0].args.destAmount;
        const aTokenBalance = await ethToken.balanceOf(user);

        if (i === 2) {
          /** cToken is not peg 1-1 to deposited token **/
          assertGreaterOrEqual(aTokenBalance, 0);
        } else {
          assertGreaterOrEqual(aTokenBalance, destAmount);
        }

        /** Test withdraw ETH from AAVE v2 **/
        if (i === 1) {
          const withdrawReceipt = await swapProxy.withdrawFromLendingPlatform(
            i, ethAddress, aTokenBalance, 0, false,
            { from: user }
          );

          expectEvent(withdrawReceipt, 'WithdrawFromLending', {
            platform: '1',
            token: ethAddress,
            amount: aTokenBalance
          });
        }
      }
    });
  });

  describe('test swapKyberAndDeposit', async () => {
    it('should burn gas token and reduce gas used', async () => {
      const srcAmount = new BN(5).pow(ethDecimals);
      const gasTokenBalanceBefore = await gasToken.balanceOf(user);

      const txWithoutGasToken = await swapProxy.swapKyberAndDeposit(
        0, ethAddress, ethAddress, srcAmount, 0, 8, user, emptyHint, false,
        { from: user, value: srcAmount }
      );

      const txWithGasToken = await swapProxy.swapKyberAndDeposit(
        0, ethAddress, ethAddress, srcAmount, 0, 8, user, emptyHint, true,
        { from: user, value: srcAmount }
      );

      const gasTokenBalanceAfter = await gasToken.balanceOf(user);

      assertLesser(txWithoutGasToken.receipt.gasUsed, txWithGasToken.receipt.gasUsed, '');
      assertLesser(gasTokenBalanceAfter, gasTokenBalanceBefore, '');
    });

    it('should take fee and directly deposit ETH to AAVE v1', async () => {
      const bps = 8;
      const srcAmount = new BN(5).pow(ethDecimals);

      const tx = await swapProxy.swapKyberAndDeposit(
        0, ethAddress, ethAddress, srcAmount, 0, 8, user, emptyHint, false,
        { from: user, value: srcAmount }
      );
      assertTxSuccess(tx);

      const aTokenBalance = await aEthV1Token.balanceOf(user);
      const stakedAmount = srcAmount.sub(srcAmount.mul(new BN(bps)).div(new BN(10000)));

      assertGreaterOrEqual(aTokenBalance, stakedAmount);
    });

    it('should swap ETH to token and deposit token to AAVE v1', async () => {
      const srcAmount = new BN(5).pow(ethDecimals);

      const rate = await swapProxy.getExpectedReturnKyber(ethAddress, usdtAddress, srcAmount, 8, emptyHint);
      const minDestAmount = rate.destAmount.mul(new BN(97)).div(new BN(100));

      const tx = await swapProxy.swapKyberAndDeposit(
        0, ethAddress, usdtAddress, srcAmount, minDestAmount, 8, user, emptyHint, false,
        { from: user, value: srcAmount }
      );

      assertTxSuccess(tx);

      const aTokenBalance = await aUsdtV1Token.balanceOf(user);
      const destAmount = tx.logs[0].args.destAmount;

      assertGreaterOrEqual(aTokenBalance, destAmount);
    });

    it('should swap token to ETH and deposit ETH to AAVE v1', async () => {
      /** Swap ETH to token for testing **/
      const ethAmount = new BN(10).pow(ethDecimals);
      await swapProxy.swapKyber(
        ethAddress, usdtAddress, ethAmount, 0, user, 8, user, emptyHint, false, { from: user, value: ethAmount }
      );

      /** Swap token to ETH and deposit **/
      const srcAmount = new BN(5).pow(new BN(6));

      const tx = await swapProxy.swapKyberAndDeposit(
        0, usdtAddress, ethAddress, srcAmount, 0, 8, user, emptyHint, false,
        { from: user }
      );
      assertTxSuccess(tx);

      const destAmount = tx.logs[0].args.destAmount;
      const aTokenBalance = await aEthV1Token.balanceOf(user);

      assertGreaterOrEqual(aTokenBalance, destAmount);
    });
  })
});
