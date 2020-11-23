const IERC20Ext = artifacts.require('@kyber.network/utils-sc/contracts/IERC20Ext.sol');
const SmartWalletSwapImplementation = artifacts.require('SmartWalletSwapImplementation.sol');
const SmartWalletSwapImplementation2 = artifacts.require('SmartWalletSwapImplementation2.sol');
const SmartWalletSwapProxy = artifacts.require('SmartWalletSwapProxy.sol');
const BurnGasHelper = artifacts.require('BurnGasHelper.sol');
const GasToken = artifacts.require('IGasToken.sol');
const IKyberProxy = artifacts.require('IKyberProxy.sol');
const UniswapRouterV02 = artifacts.require('@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol');

const BN = web3.utils.BN;

// address of uniswap router in mainnet
const kyberProxy = "0x9AAb3f75489902f3a48495025729a0AF77d4b11e";
const weth = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const uniswapRouter = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';
const sushiswapRouter = '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f';
const usdtAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f';
const gasTokenAddress = '0x0000000000b3F879cb30FE243b4Dfee438691c04';

const {ethAddress, ethDecimals, calcDstQty, assertMost, emptyHint} = require('./helper');
const Helper = require('./helper');

let swapImplementation;
let swapProxy;
let burnGasHelper;
let user;
let admin;

contract('SmartWalletSwapImplementation', accounts => {
  describe('test some simple trades', async () => {
    before('test trade in uniswap curve', async () => {
      user = accounts[0];
      admin = accounts[0];
      burnGasHelper = await BurnGasHelper.new(
        admin, gasTokenAddress, 14154, 6870, 24000
      );
      swapImplementation = await SmartWalletSwapImplementation.new(
        admin, kyberProxy, [], burnGasHelper.address
      );
      swapProxy = await SmartWalletSwapProxy.new(admin, swapImplementation.address);
      swapProxy = await SmartWalletSwapImplementation.at(swapProxy.address);

      // approve allowance
      await swapProxy.approveAllowances(
        [weth, usdtAddress, usdcAddress, daiAddress], [kyberProxy, uniswapRouter, sushiswapRouter], false, { from: admin }
      );
      // update storage data
      await swapProxy.updateKyberProxy(kyberProxy, { from: admin });
      await swapProxy.updateUniswapRouters([uniswapRouter, sushiswapRouter], true, { from: admin });
      await swapProxy.updateSupportedPlatformWallets([user], true, { from: admin });

      // mint and transfer gas token to user
      let gasToken = await GasToken.at(gasTokenAddress);
      await gasToken.mint(100);
      await gasToken.mint(100);
      await gasToken.transfer(user, 200);

      let tokenAddresses = [gasTokenAddress, usdtAddress, usdcAddress, daiAddress];
      for(let i = 0; i < tokenAddresses.length; i++) {
        let token = await IERC20Ext.at(tokenAddresses[i]);
        await token.approve(swapProxy.address, new BN(2).pow(new BN(255)), { from: user });
      }
    });

    it('trade on Kyber directly', async() => {
      let tokenNames = ["USDT", "USDC", "DAI"];
      let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
      // let tokenDecimals = [6, 6, 18];
      let ethAmount = new BN(10).pow(new BN(ethDecimals)); // one eth
      for(let i = 0; i < tokenAddresses.length; i++) {
        let proxy = await IKyberProxy.at(kyberProxy);
        let tx = await proxy.tradeWithHintAndFee(
          ethAddress, ethAmount, tokenAddresses[i], user, new BN(2).pow(new BN(255)), new BN(0), user, 8, emptyHint, { value: ethAmount, from: user }
        );
        console.log(`[Direct-Kyber] Transaction gas used ETH -> ${tokenNames[i]} without gas token: ${tx.receipt.gasUsed}`);

        let token = await IERC20Ext.at(tokenAddresses[i]);
        let tokenAmount = await token.balanceOf(user);
        await token.approve(kyberProxy, tokenAmount, { from: user });

        tx = await proxy.tradeWithHintAndFee(
          tokenAddresses[i], tokenAmount, ethAddress, user, new BN(2).pow(new BN(255)), new BN(0), user, 8, emptyHint, { from: user }
        );
        console.log(`[Direct-Kyber] Transaction gas used ${tokenNames[i]} -> ETH without gas token: ${tx.receipt.gasUsed}`);
      }
    });

    // it('trade t2e on Uniswap', async () => {
    //   let tokenNames = ["USDT", "USDC", "DAI"];
    //   let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
    //   let routers = [uniswapRouter, sushiswapRouter];
    //   let routerNames = ["Uniswap", "Sushiswap"];
    //   // let tokenDecimals = [6, 6, 18];
    //   for(let i = 0; i < routers.length; i++) {
    //     for(let j = 0; j < tokenAddresses.length; j++) {
    //       let token = await IERC20Ext.at(tokenAddresses[j]);
    //       let tokenAmount = (await token.balanceOf(user)).div(new BN(5));
    //       let tradePath = [tokenAddresses[j], weth]; // get rate needs to use weth
    //       let data = await swapImplementation.getExpectedReturnUniswap(routers[i], tokenAmount, tradePath, 8);
    //       // console.log(`Expected dest amount: ${data.destAmount.toString(10)}`);
    //       // console.log(`Expected rate: ${data.expectedRate.toString(10)}`);
    //       let minDestAmount = data.destAmount.mul(new BN(97)).div(new BN(100));
  
    //       let tokenBalanceBefore = await token.balanceOf(swapImplementation.address);
    //       tradePath[1] = ethAddress; // trade needs to use eth address
    //       await token.approve(swapImplementation.addess, tokenAmount);
    //       let tx = await swapImplementation.swapUniswap(
    //         routers[i], tokenAmount, minDestAmount, tradePath, user, 8, user, false, { from: user }
    //       );
    //       let tokenBalanceAfter = await token.balanceOf(swapImplementation.address);
    //       console.log(`Balance changes: ${tokenBalanceAfter.sub(tokenBalanceBefore).toString(10)}`);
    //       console.log(`[${routerNames[i]}] Transaction gas used ${tokenNames[j]} -> ETH without gas token: ${tx.receipt.gasUsed}`);
    //       await token.approve(swapImplementation.addess, tokenAmount);
    //       tx = await swapImplementation.swapUniswap(
    //         routers[i], tokenAmount, minDestAmount, tradePath, user, 8, user, true, { from: user }
    //       );
    //       tokenBalanceAfter = await token.balanceOf(swapImplementation.address);
    //       console.log(`Balance changes: ${tokenBalanceAfter.sub(tokenBalanceBefore).toString(10)}`);
    //       console.log(`[${routerNames[i]}] Transaction gas used ${tokenNames[j]} -> ETH with gas token: ${tx.receipt.gasUsed}`);
    //     }
    //   }
    // });

    it('trade e2t on kyber', async () => {
      let tokenNames = ["USDT", "USDC", "DAI"];
      let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
      // let tokenDecimals = [6, 6, 18];
      let ethAmount = new BN(10).pow(new BN(ethDecimals)); // one eth
      for(let i = 0; i < tokenAddresses.length; i++) {
        let token = tokenAddresses[i];
        let data = await swapImplementation.getExpectedReturnKyber(ethAddress, token, ethAmount, 8, emptyHint);
        // console.log(`Expected dest amount: ${data.destAmount.toString(10)}`);
        // console.log(`Expected rate: ${data.expectedRate.toString(10)}`);
        let minRate = data.expectedRate.mul(new BN(97)).div(new BN(100));

        let tx = await swapProxy.swapKyber(
          ethAddress, token, ethAmount, minRate, user, 8, user, emptyHint, false, { from: user, value: ethAmount, gas: 2000000 }
        );
        console.log(`[Kyber] Transaction gas used ETH -> ${tokenNames[i]} without gas token: ${tx.receipt.gasUsed}`);
        tx = await swapProxy.swapKyber(
          ethAddress, token, ethAmount, minRate, user, 8, user, emptyHint, true, { from: user, value: ethAmount, gas: 2000000 }
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
      for(let i = 0; i < routers.length; i++) {
        for(let j = 0; j < tokenAddresses.length; j++) {
          let token = tokenAddresses[j];
          let tradePath = [weth, token]; // get rate needs to use weth
          let data = await swapImplementation.getExpectedReturnUniswap(routers[i], ethAmount, tradePath, 8);
          // console.log(`Expected dest amount: ${data.destAmount.toString(10)}`);
          // console.log(`Expected rate: ${data.expectedRate.toString(10)}`);
          let minDestAmount = data.destAmount.mul(new BN(97)).div(new BN(100));
  
          // let ethBalanceBefore = await web3.utils.toBN(await web3.eth.getBalance(swapProxy.address));
          tradePath[0] = ethAddress; // trade needs to use eth address
          let tx = await swapProxy.swapUniswap(
            routers[i], ethAmount, minDestAmount, tradePath, user, 8, user, false, { from: user, value: ethAmount }
          );
          // let ethBalanceAfter = await web3.utils.toBN(await web3.eth.getBalance(swapProxy.address));
          // console.log(`Balance changes: ${ethBalanceAfter.sub(ethBalanceBefore).toString(10)}`);
          console.log(`[${routerNames[i]}] Transaction gas used ETH -> ${tokenNames[j]} without gas token: ${tx.receipt.gasUsed}`);
          tx = await swapProxy.swapUniswap(
            routers[i], ethAmount, minDestAmount, tradePath, user, 8, user, true, { from: user, value: ethAmount }
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
      for(let i = 0; i < tokenAddresses.length; i++) {
        let token = await IERC20Ext.at(tokenAddresses[i]);
        let tokenAmount = (await token.balanceOf(user)).div(new BN(5));
        let data = await swapImplementation.getExpectedReturnKyber(tokenAddresses[i], ethAddress, tokenAmount, 8, emptyHint);
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
      for(let i = 0; i < routers.length; i++) {
        for(let j = 0; j < tokenAddresses.length; j++) {
          let token = await IERC20Ext.at(tokenAddresses[j]);
          let tokenAmount = (await token.balanceOf(user)).div(new BN(5));
          let tradePath = [tokenAddresses[j], weth]; // get rate needs to use weth
          let data = await swapImplementation.getExpectedReturnUniswap(routers[i], tokenAmount, tradePath, 8);
          // console.log(`Expected dest amount: ${data.destAmount.toString(10)}`);
          // console.log(`Expected rate: ${data.expectedRate.toString(10)}`);
          let minDestAmount = data.destAmount.mul(new BN(97)).div(new BN(100));
  
          let tokenBalanceBefore = await token.balanceOf(swapProxy.address);
          tradePath[1] = ethAddress; // trade needs to use eth address
          let tx = await swapProxy.swapUniswap(
            routers[i], tokenAmount, minDestAmount, tradePath, user, 8, user, false, { from: user }
          );
          let tokenBalanceAfter = await token.balanceOf(swapProxy.address);
          // console.log(`Balance changes: ${tokenBalanceAfter.sub(tokenBalanceBefore).toString(10)}`);
          console.log(`[${routerNames[i]}] Transaction gas used ${tokenNames[j]} -> ETH without gas token: ${tx.receipt.gasUsed}`);
          tx = await swapProxy.swapUniswap(
            routers[i], tokenAmount, minDestAmount, tradePath, user, 8, user, true, { from: user }
          );
          tokenBalanceAfter = await token.balanceOf(swapProxy.address);
          // console.log(`Balance changes: ${tokenBalanceAfter.sub(tokenBalanceBefore).toString(10)}`);
          console.log(`[${routerNames[i]}] Transaction gas used ${tokenNames[j]} -> ETH with gas token: ${tx.receipt.gasUsed}`);
        }
      }
    });

    describe(`Upgrade implementation and test`, async() => {
      before(`Upgrade implementation`, async() => {
        swapImplementation = await SmartWalletSwapImplementation2.new(
          admin, kyberProxy, [], burnGasHelper.address
        );
        // update implementation
        swapProxy = await SmartWalletSwapProxy.at(swapProxy.address);
        await swapProxy.updateNewImplementation(swapImplementation.address, { from : admin });

        swapProxy = await SmartWalletSwapImplementation2.at(swapProxy.address);
      });

      it('trade e2t on kyber', async () => {
        let tokenNames = ["USDT", "USDC", "DAI"];
        let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
        // let tokenDecimals = [6, 6, 18];
        let ethAmount = new BN(10).pow(new BN(ethDecimals)); // one eth
        for(let i = 0; i < tokenAddresses.length; i++) {
          let token = tokenAddresses[i];
          let data = await swapImplementation.getExpectedReturnKyber(ethAddress, token, ethAmount, 8, emptyHint);
          // console.log(`Expected dest amount: ${data.destAmount.toString(10)}`);
          // console.log(`Expected rate: ${data.expectedRate.toString(10)}`);
          let minRate = data.expectedRate.mul(new BN(97)).div(new BN(100));
  
          let tx = await swapProxy.swapKyber(
            ethAddress, token, ethAmount, minRate, user, 8, user, emptyHint, false, { from: user, value: ethAmount }
          );
          console.log(`[Kyber] Transaction gas used ETH -> ${tokenNames[i]} without gas token: ${tx.receipt.gasUsed}`);
          tx = await swapProxy.swapKyber(
            ethAddress, token, ethAmount, minRate, user, 8, user, emptyHint, true, { from: user, value: ethAmount }
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
        for(let i = 0; i < routers.length; i++) {
          for(let j = 0; j < tokenAddresses.length; j++) {
            let token = tokenAddresses[j];
            let tradePath = [weth, token]; // get rate needs to use weth
            let data = await swapImplementation.getExpectedReturnUniswap(routers[i], ethAmount, tradePath, 8);
            // console.log(`Expected dest amount: ${data.destAmount.toString(10)}`);
            // console.log(`Expected rate: ${data.expectedRate.toString(10)}`);
            let minDestAmount = data.destAmount.mul(new BN(97)).div(new BN(100));
    
            // let ethBalanceBefore = await web3.utils.toBN(await web3.eth.getBalance(swapProxy.address));
            tradePath[0] = ethAddress; // trade needs to use eth address
            let tx = await swapProxy.swapUniswap(
              routers[i], ethAmount, minDestAmount, tradePath, user, 8, user, false, { from: user, value: ethAmount }
            );
            // let ethBalanceAfter = await web3.utils.toBN(await web3.eth.getBalance(swapProxy.address));
            // console.log(`Balance changes: ${ethBalanceAfter.sub(ethBalanceBefore).toString(10)}`);
            console.log(`[${routerNames[i]}] Transaction gas used ETH -> ${tokenNames[j]} without gas token: ${tx.receipt.gasUsed}`);
            tx = await swapProxy.swapUniswap(
              routers[i], ethAmount, minDestAmount, tradePath, user, 8, user, true, { from: user, value: ethAmount }
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
        for(let i = 0; i < tokenAddresses.length; i++) {
          let token = await IERC20Ext.at(tokenAddresses[i]);
          let tokenAmount = (await token.balanceOf(user)).div(new BN(5));
          let data = await swapImplementation.getExpectedReturnKyber(tokenAddresses[i], ethAddress, tokenAmount, 8, emptyHint);
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
        for(let i = 0; i < routers.length; i++) {
          for(let j = 0; j < tokenAddresses.length; j++) {
            let token = await IERC20Ext.at(tokenAddresses[j]);
            let tokenAmount = (await token.balanceOf(user)).div(new BN(5));
            let tradePath = [tokenAddresses[j], weth]; // get rate needs to use weth
            let data = await swapImplementation.getExpectedReturnUniswap(routers[i], tokenAmount, tradePath, 8);
            // console.log(`Expected dest amount: ${data.destAmount.toString(10)}`);
            // console.log(`Expected rate: ${data.expectedRate.toString(10)}`);
            let minDestAmount = data.destAmount.mul(new BN(97)).div(new BN(100));
    
            let tokenBalanceBefore = await token.balanceOf(swapProxy.address);
            tradePath[1] = ethAddress; // trade needs to use eth address
            let tx = await swapProxy.swapUniswap(
              routers[i], tokenAmount, minDestAmount, tradePath, user, 8, user, false, { from: user }
            );
            let tokenBalanceAfter = await token.balanceOf(swapProxy.address);
            // console.log(`Balance changes: ${tokenBalanceAfter.sub(tokenBalanceBefore).toString(10)}`);
            console.log(`[${routerNames[i]}] Transaction gas used ${tokenNames[j]} -> ETH without gas token: ${tx.receipt.gasUsed}`);
            tx = await swapProxy.swapUniswap(
              routers[i], tokenAmount, minDestAmount, tradePath, user, 8, user, true, { from: user }
            );
            tokenBalanceAfter = await token.balanceOf(swapProxy.address);
            // console.log(`Balance changes: ${tokenBalanceAfter.sub(tokenBalanceBefore).toString(10)}`);
            console.log(`[${routerNames[i]}] Transaction gas used ${tokenNames[j]} -> ETH with gas token: ${tx.receipt.gasUsed}`);
          }
        }
      });
    });
  });
});
