const BN = web3.utils.BN;

const {
  emptyHint,
  ethAddress,
  daiAddress,
  ethDecimals,
  uniswapRouter,
  assertTxSuccess,
} = require('./helper');

const {
  setupBeforeTest,
  setupBeforeEachTest
} = require('./setupTestingEnvironment');

let aaveV1Pool;
let swapProxy;
let user;
let gasToken;

contract('SmartWalletSwapImplementation', accounts => {
  before('setup testing environment', async () => {
    const result = await setupBeforeTest(accounts)

    user = result.user;
    swapProxy = result.swapProxy;
    gasToken = result.gasToken;
    aaveV1Pool = result.aaveV1Pool;
  });

  beforeEach('mint gas token and transfer to user', async () => {
    await setupBeforeEachTest(gasToken, user);
  });

  describe('test swap and repay', async () => {
    it('should be able to repay the debt through Kyber swap', async () => {
      const srcAmount = new BN(10).pow(ethDecimals);
      const swapTradePath = [ethAddress];
      const borrowAmount = new BN(10).pow(new BN(18));

      /** Deposit ETH **/
      await swapProxy.swapUniswapAndDeposit(
        0, uniswapRouter, srcAmount, 0, swapTradePath, 8, user, false,
        { from: user, value: srcAmount }
      );

      /** Enable ETH as collateral **/
      await aaveV1Pool.setUserUseReserveAsCollateral(ethAddress, true);

      /** Borrow DAI **/
      await aaveV1Pool.borrow(
        daiAddress, borrowAmount, 1, 0,
        { from: user }
      );

      /** Repay DAI **/
      const tx = await swapProxy.swapKyberAndRepay(
        0, daiAddress, daiAddress, borrowAmount, borrowAmount, 0, user, emptyHint, false,
        { from: user }
      );

      assertTxSuccess(tx);
    });
  })
});
