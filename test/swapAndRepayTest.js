const IERC20Ext = artifacts.require('@kyber.network/utils-sc/contracts/IERC20Ext.sol');
const BN = web3.utils.BN;

const {
  evm_revert,
  evm_snapshot,
  emptyHint,
  ethAddress,
  ethDecimals,
  daiAddress,
  uniswapRouter,
  assertTxSuccess,
  assertEqual,
  COMPOUND_ADDRESSES,
} = require('./helper');

const {
  setupBeforeTest,
} = require('./setupTestingEnvironment');

let globalSnapshotId;
let snapshotId;
let aaveV1Pool;
let aaveV2Pool;
let compoundPool;
let swapProxy;
let user;
let cDaiToken;

contract('SmartWalletSwapImplementation', accounts => {
  before('setup testing environment', async () => {
    globalSnapshotId = await evm_snapshot();
    const result = await setupBeforeTest(accounts)

    user = result.user;
    swapProxy = result.swapProxy;
    aaveV1Pool = result.aaveV1Pool;
    aaveV2Pool = result.aaveV2Pool;
    compoundPool = result.compoundPool;
    cDaiToken = result.cDaiToken;
    snapshotId = result.snapshotId;
  });

  beforeEach(async () => {
    await evm_revert(snapshotId);
    snapshotId = await evm_snapshot();
  });

  after(async () => {
    await evm_revert(globalSnapshotId);
  });

  describe('test swap and repay', async () => {
    it('should be able to repay the debt through Kyber swap', async () => {
      const ethAmount = new BN(10).pow(ethDecimals);
      const borrowAmount = new BN(10).pow(new BN(18));
      const swapTradePath = [ethAddress];
      const lendingPools = [aaveV1Pool, aaveV2Pool, compoundPool];
      const daiToken = await IERC20Ext.at(daiAddress);
      let startBalance = await daiToken.balanceOf(user);

      for (let i = 0; i < lendingPools.length; i++) {
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

        if (i === 0) {
          /** Borrow AAVE v1 **/
          await lendingPool.borrow(
            daiAddress, borrowAmount, 1, 0,
            { from: user }
          );
        } else if(i === 1) {
          /** Borrow AAVE v2 **/
          await lendingPool.borrow(
            daiAddress, borrowAmount, 1, 0, user,
            { from: user }
          );
        } else {
          /** Enable ETH as collateral **/
          await lendingPool.enterMarkets([COMPOUND_ADDRESSES.cEthAddress]);

          /** Borrow Compound **/
          await cDaiToken.borrow(borrowAmount, { from: user });
        }

        let balance = (await daiToken.balanceOf(user)).sub(startBalance);
        assertEqual(balance, borrowAmount, '');

        /** Repay **/
        const tx = await swapProxy.swapKyberAndRepay(
          i, daiAddress, daiAddress, borrowAmount, borrowAmount, 10000, user, emptyHint, false,
          { from: user }
        );

        assertTxSuccess(tx);

        let balanceAfterRepay = (await daiToken.balanceOf(user)).sub(startBalance);

        assertEqual(balanceAfterRepay, new BN(0), '');
      }
    });
  })
});
