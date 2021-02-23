const IERC20Ext = artifacts.require('@kyber.network/utils-sc/contracts/IERC20Ext.sol');
const SmartWalletSwapImplementation = artifacts.require('SmartWalletSwapImplementation.sol');
const SmartWalletSwapProxy = artifacts.require('SmartWalletSwapProxy.sol');
const SmartWalletLending = artifacts.require('SmartWalletLending.sol');
const BurnGasHelper = artifacts.require('BurnGasHelper.sol');
const GasToken = artifacts.require('IGasToken.sol');

const BN = web3.utils.BN;

// address of uniswap router in mainnet
const weth = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const uniswapRouter = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';
const sushiswapRouter = '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f';
const usdtAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f';

const {
  emptyHint,
  ethAddress,
  ethDecimals,
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
  });

  beforeEach('mint gas token and transfer to user', async () => {
    await setupBeforeEachTest(gasToken, user);
  });

  describe('test some simple trades', async () => {
    it('trade e2t on kyber', async () => {
      let tokenNames = ["USDT", "USDC", "DAI"];
      let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
      // let tokenDecimals = [6, 6, 18];
      let ethAmount = new BN(10).pow(new BN(ethDecimals)); // one eth
      for (let i = 0; i < tokenAddresses.length; i++) {
        let token = tokenAddresses[i];
        let data = await swapProxy.getExpectedReturnKyber(ethAddress, token, ethAmount, 8, emptyHint);
        // console.log(`Expected dest amount: ${data.destAmount.toString(10)}`);
        // console.log(`Expected rate: ${data.expectedRate.toString(10)}`);
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
      let tokenNames = ["USDT", "USDC", "DAI"];
      let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
      let routers = [uniswapRouter, sushiswapRouter];
      let routerNames = ["Uniswap", "Sushiswap"];
      // let tokenDecimals = [6, 6, 18];
      let ethAmount = new BN(10).pow(new BN(ethDecimals)); // one eth
      for (let i = 0; i < routers.length; i++) {
        for (let j = 0; j < tokenAddresses.length; j++) {
          let token = tokenAddresses[j];
          let tradePath = [weth, token]; // get rate needs to use weth
          let data = await swapProxy.getExpectedReturnUniswap(routers[i], ethAmount, tradePath, 8);
          // console.log(`Expected dest amount: ${data.destAmount.toString(10)}`);
          // console.log(`Expected rate: ${data.expectedRate.toString(10)}`);
          let minDestAmount = data.destAmount.mul(new BN(97)).div(new BN(100));

          // let ethBalanceBefore = await web3.utils.toBN(await web3.eth.getBalance(swapProxy.address));
          tradePath[0] = ethAddress; // trade needs to use eth address
          let tx = await swapProxy.swapUniswap(
            routers[i], ethAmount, minDestAmount, tradePath, user, 8, user, true, false, {
              from: user,
              value: ethAmount
            }
          );
          // let ethBalanceAfter = await web3.utils.toBN(await web3.eth.getBalance(swapProxy.address));
          // console.log(`Balance changes: ${ethBalanceAfter.sub(ethBalanceBefore).toString(10)}`);
          console.log(`[${routerNames[i]}] Transaction gas used ETH -> ${tokenNames[j]} without gas token: ${tx.receipt.gasUsed}`);
          tx = await swapProxy.swapUniswap(
            routers[i], ethAmount, minDestAmount, tradePath, user, 8, user, true, true, { from: user, value: ethAmount }
          );
          ethBalanceAfter = await web3.utils.toBN(await web3.eth.getBalance(swapProxy.address));
          // console.log(`Balance changes: ${ethBalanceAfter.sub(ethBalanceBefore).toString(10)}`);
          console.log(`[${routerNames[i]}] Transaction gas used ETH -> ${tokenNames[j]} with gas token: ${tx.receipt.gasUsed}`);
        }
      }
    });

    it('trade t2e on kyber', async () => {
      let tokenNames = ["USDT", "USDC", "DAI"];
      let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
      // let tokenDecimals = [6, 6, 18];
      for (let i = 0; i < tokenAddresses.length; i++) {
        let token = await IERC20Ext.at(tokenAddresses[i]);
        let tokenAmount = (await token.balanceOf(user)).div(new BN(5));
        let data = await swapProxy.getExpectedReturnKyber(tokenAddresses[i], ethAddress, tokenAmount, 8, emptyHint);
        // console.log(`Expected dest amount: ${data.destAmount.toString(10)}`);
        // console.log(`Expected rate: ${data.expectedRate.toString(10)}`);
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
      let tokenNames = ["USDT", "USDC", "DAI"];
      let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
      let routers = [uniswapRouter, sushiswapRouter];
      let routerNames = ["Uniswap", "Sushiswap"];
      // let tokenDecimals = [6, 6, 18];
      for (let i = 0; i < routers.length; i++) {
        for (let j = 0; j < tokenAddresses.length; j++) {
          let token = await IERC20Ext.at(tokenAddresses[j]);
          let tokenAmount = (await token.balanceOf(user)).div(new BN(5));
          let tradePath = [tokenAddresses[j], weth]; // get rate needs to use weth
          let data = await swapProxy.getExpectedReturnUniswap(routers[i], tokenAmount, tradePath, 8);
          // console.log(`Expected dest amount: ${data.destAmount.toString(10)}`);
          // console.log(`Expected rate: ${data.expectedRate.toString(10)}`);
          let minDestAmount = data.destAmount.mul(new BN(97)).div(new BN(100));

          let tokenBalanceBefore = await token.balanceOf(swapProxy.address);
          tradePath[1] = ethAddress; // trade needs to use eth address
          let tx = await swapProxy.swapUniswap(
            routers[i], tokenAmount, minDestAmount, tradePath, user, 8, user, true, false, { from: user }
          );
          let tokenBalanceAfter = await token.balanceOf(swapProxy.address);
          // console.log(`Balance changes: ${tokenBalanceAfter.sub(tokenBalanceBefore).toString(10)}`);
          console.log(`[${routerNames[i]}] Transaction gas used ${tokenNames[j]} -> ETH without gas token: ${tx.receipt.gasUsed}`);
          tx = await swapProxy.swapUniswap(
            routers[i], tokenAmount, minDestAmount, tradePath, user, 8, user, true, true, { from: user }
          );
          tokenBalanceAfter = await token.balanceOf(swapProxy.address);
          // console.log(`Balance changes: ${tokenBalanceAfter.sub(tokenBalanceBefore).toString(10)}`);
          console.log(`[${routerNames[i]}] Transaction gas used ${tokenNames[j]} -> ETH with gas token: ${tx.receipt.gasUsed}`);
        }
      }
    });
  });
});
