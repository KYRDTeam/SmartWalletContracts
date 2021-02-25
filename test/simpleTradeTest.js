const IERC20Ext = artifacts.require('@kyber.network/utils-sc/contracts/IERC20Ext.sol');
const BN = web3.utils.BN;

const {
  emptyHint,
  ethAddress,
  ethDecimals,
  uniswapRouter,
  sushiswapRouter,
  usdtAddress,
  usdcAddress,
  wethAddress
} = require('./helper');

const {
  setupBeforeTest
} = require('./setupTestingEnvironment');

let swapProxy;
let user;
let gasToken;

contract('SmartWalletSwapImplementation', accounts => {
  before('setup testing environment', async () => {
    const result = await setupBeforeTest(accounts)

    user = result.user;
    swapProxy = result.swapProxy;
    gasToken = result.gasToken;
  });

  describe('test some simple trades', async () => {
    it('trade e2t on kyber', async () => {
      let tokenNames = ["USDT", "USDC"];
      let tokenAddresses = [usdtAddress, usdcAddress];
      let ethAmount = new BN(10).pow(new BN(ethDecimals)); // one eth
      for (let i = 0; i < tokenAddresses.length; i++) {
        let token = tokenAddresses[i];
        let data = await swapProxy.getExpectedReturnKyber(ethAddress, token, ethAmount, 8, emptyHint);
        let minRate = data.expectedRate.mul(new BN(97)).div(new BN(100));

        let tx = await swapProxy.swapKyber(
          ethAddress, token, ethAmount, minRate, user, 8, user, emptyHint, false, {
            from: user,
            value: ethAmount,
            gas: 2000000
          }
        );
        console.log(`[Kyber] Transaction gas used ETH -> ${tokenNames[i]} without gas token: ${tx.receipt.gasUsed}`);
        tx = await swapProxy.swapKyber(
          ethAddress, token, ethAmount, minRate, user, 8, user, emptyHint, true, {
            from: user,
            value: ethAmount,
            gas: 2000000
          }
        );
        console.log(`[Kyber] Transaction gas used ETH -> ${tokenNames[i]} with gas token: ${tx.receipt.gasUsed}`);
      }
    });

    it('trade e2t on Uniswap', async () => {
      let tokenNames = ["USDT", "USDC"];
      let tokenAddresses = [usdtAddress, usdcAddress];
      let routers = [uniswapRouter, sushiswapRouter];
      let routerNames = ["Uniswap", "Sushiswap"];
      let ethAmount = new BN(10).pow(new BN(ethDecimals)); // one eth
      for (let i = 0; i < routers.length; i++) {
        for (let j = 0; j < tokenAddresses.length; j++) {
          let token = tokenAddresses[j];
          let tradePath = [wethAddress, token]; // get rate needs to use weth
          let data = await swapProxy.getExpectedReturnUniswap(routers[i], ethAmount, tradePath, 8);
          let minDestAmount = data.destAmount.mul(new BN(97)).div(new BN(100));

          tradePath[0] = ethAddress; // trade needs to use eth address
          let tx = await swapProxy.swapUniswap(
            routers[i], ethAmount, minDestAmount, tradePath, user, 8, user, true, false, {
              from: user,
              value: ethAmount
            }
          );
          console.log(`[${routerNames[i]}] Transaction gas used ETH -> ${tokenNames[j]} without gas token: ${tx.receipt.gasUsed}`);
          tx = await swapProxy.swapUniswap(
            routers[i], ethAmount, minDestAmount, tradePath, user, 8, user, true, true, { from: user, value: ethAmount }
          );
          console.log(`[${routerNames[i]}] Transaction gas used ETH -> ${tokenNames[j]} with gas token: ${tx.receipt.gasUsed}`);
        }
      }
    });

    it('trade t2e on kyber', async () => {
      let tokenNames = ["USDT", "USDC"];
      let tokenAddresses = [usdtAddress, usdcAddress];
      for (let i = 0; i < tokenAddresses.length; i++) {
        let token = await IERC20Ext.at(tokenAddresses[i]);
        let tokenAmount = (await token.balanceOf(user)).div(new BN(5));
        let data = await swapProxy.getExpectedReturnKyber(tokenAddresses[i], ethAddress, tokenAmount, 8, emptyHint);
        let minRate = data.expectedRate.mul(new BN(97)).div(new BN(100));

        let tx = await swapProxy.swapKyber(
          tokenAddresses[i], ethAddress, tokenAmount, minRate, user, 8, user, emptyHint, false, { from: user }
        );
        console.log(`[Kyber] Transaction gas used ${tokenNames[i]} -> ETH without gas token: ${tx.receipt.gasUsed}`);
        tx = await swapProxy.swapKyber(
          tokenAddresses[i], ethAddress, tokenAmount, minRate, user, 8, user, emptyHint, false, { from: user }
        );
        console.log(`[Kyber] Transaction gas used ${tokenNames[i]} -> ETH with gas token: ${tx.receipt.gasUsed}`);
      }
    });

    it('trade t2e on Uniswap', async () => {
      let tokenNames = ["USDT", "USDC"];
      let tokenAddresses = [usdtAddress, usdcAddress];
      let routers = [uniswapRouter, sushiswapRouter];
      let routerNames = ["Uniswap", "Sushiswap"];
      for (let i = 0; i < routers.length; i++) {
        for (let j = 0; j < tokenAddresses.length; j++) {
          let token = await IERC20Ext.at(tokenAddresses[j]);
          let tokenAmount = (await token.balanceOf(user)).div(new BN(5));
          let tradePath = [tokenAddresses[j], wethAddress]; // get rate needs to use weth
          let data = await swapProxy.getExpectedReturnUniswap(routers[i], tokenAmount, tradePath, 8);
          let minDestAmount = data.destAmount.mul(new BN(97)).div(new BN(100));

          tradePath[1] = ethAddress; // trade needs to use eth address
          let tx = await swapProxy.swapUniswap(
            routers[i], tokenAmount, minDestAmount, tradePath, user, 8, user, true, false, { from: user }
          );
          let tokenBalanceAfter = await token.balanceOf(swapProxy.address);
          console.log(`[${routerNames[i]}] Transaction gas used ${tokenNames[j]} -> ETH without gas token: ${tx.receipt.gasUsed}`);
          tx = await swapProxy.swapUniswap(
            routers[i], tokenAmount, minDestAmount, tradePath, user, 8, user, true, true, { from: user }
          );
          tokenBalanceAfter = await token.balanceOf(swapProxy.address);
          console.log(`[${routerNames[i]}] Transaction gas used ${tokenNames[j]} -> ETH with gas token: ${tx.receipt.gasUsed}`);
        }
      }
    });
  });
});
