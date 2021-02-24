const BN = web3.utils.BN;

const {
  emptyHint,
  ethAddress,
  ethDecimals,
  uniswapRouter,
  assertTxSuccess,
  lendingPlatforms,
  daiAddress
} = require('./helper');

const {
  setupBeforeTest,
  setupBeforeEachTest
} = require('./setupTestingEnvironment');

let aaveV1Pool;
let aaveV2Pool;
let compoundPool;
let swapProxy;
let user;
let gasToken;
let cDaiToken;

contract('SmartWalletSwapImplementation', accounts => {
  before('setup testing environment', async () => {
    const result = await setupBeforeTest(accounts)

    user = result.user;
    swapProxy = result.swapProxy;
    gasToken = result.gasToken;
    aaveV1Pool = result.aaveV1Pool;
    aaveV2Pool = result.aaveV1Pool;
    compoundPool = result.compoundPool;
    cDaiToken = result.cDaiToken;
  });

  beforeEach('mint gas token and transfer to user', async () => {
    await setupBeforeEachTest(gasToken, user);
  });

  describe('test swap and repay', async () => {
    it('should be able to repay the debt through Kyber swap', async () => {
      const ethAmount = new BN(10).pow(ethDecimals);
      const borrowAmount = new BN(10).pow(new BN(18));
      const swapTradePath = [ethAddress];
      const lendingPools = [aaveV1Pool, aaveV2Pool, compoundPool]

      for (let i = 0; i < lendingPlatforms.length; i++) {
        console.log(i);
        const lendingPool = lendingPools[i];

        /** Deposit ETH **/
        await swapProxy.swapUniswapAndDeposit(
          i, uniswapRouter, ethAmount, 0, swapTradePath, 8, user, false,
          { from: user, value: ethAmount }
        );

        if (i === 0) {
          /** Enable ETH as collateral **/
          await lendingPool.setUserUseReserveAsCollateral(ethAddress, true);
        }

        if (i === 0 || i === 1) {
          /** Borrow **/
          await lendingPool.borrow(
            daiAddress, borrowAmount, 1, 0,
            { from: user }
          );
        } else {
          /** Enable ETH as collateral **/
          await lendingPool.enterMarkets(ethAddress);

          /** Borrow **/
          await cDaiToken.borrow(borrowAmount, { from: user });
        }

        /** Repay **/
        const tx = await swapProxy.swapKyberAndRepay(
          i, daiAddress, daiAddress, borrowAmount, borrowAmount, 8, user, emptyHint, false,
          { from: user }
        );

        assertTxSuccess(tx);
      }
    });
  })
});
