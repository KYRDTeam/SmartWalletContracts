# Introduction

[![built-with openzeppelin](https://img.shields.io/badge/built%20with-OpenZeppelin-3677FF)](https://docs.openzeppelin.com/)
[![Build Status](https://api.travis-ci.com/KyberNetwork/kyber_reserves_sc.svg?branch=master&status=passed)](https://travis-ci.com/github/KyberNetwork/kyber_reserves_sc)


Smart Contracts for Smart Wallet to help interacting with Kyber Network's protocol and Uniswap (+ its clones, for example: Sushiswap, SashimiSwap, etc);


## Package Manager
We use `yarn` as the package manager. You may use `npm` and `npx` instead, but commands in bash scripts may have to be changed accordingly.


## Setup
1. Clone this repo
2. `yarn install`


## Compilation with Buidler
`yarn compile` to compile contracts for all solidity versions.


## Contract Deployment / Interactions

For interactions or contract deployments on public testnets / mainnet, create a `.env` file specifying your private key and infura api key, with the following format:

```
PRIVATE_KEY=0x****************************************************************
INFURA_API_KEY=********************************
```

## Testing with Buidler
1. If contracts have not been compiled, run `yarn compile`. This step can be skipped subsequently.
2. Run `yarn test`
3. Use `./tst.sh -f` for running a specific test file.

### Example Commands
- `yarn test` (Runs all tests)
- `./tst.sh -f ./test/smartWalletSwapKyberUni.js` (Test only kyberReserve.js)

### Example
`yarn buidler test --no-compile ./test/smartWalletSwapKyberUni.js`

### Coverage with `buidler-coverage`
- Run `yarn coverage` for coverage on files


### Functionalities


#### Exchange tokens

- Get expected returned amount and conversion rate if using Kyber Network's protocol. Use `hint` for reserve routing.
```
function getExpectedReturnKyber(
        IERC20Ext src,
        IERC20Ext dest,
        uint256 srcAmount,
        uint256 platformFee,
        bytes calldata hint
    ) external override view returns (
        uint256 destAmount,
        uint256 expectedRate
    );
```

- Get expected returned amount and conversion rate if using Uni-Router, `router` must be added to the list supported routers;
```
function getExpectedReturnUniswap(
        IUniswapV2Router02 router,
        uint256 srcAmount,
        address[] calldata tradePath,
        uint256 platformFee
    ) external override view returns (
        uint256 destAmount,
        uint256 expectedRate
    );
```

- Swap on Kyber Network's protocol, `platformWallet` must be added to the list supported platform wallets. Use `hint` for reserve routing. If `userGasToken` is enabled, user must approve Proxy contract to use CHI token. Amount of CHI tokens to burn will be calculated automatically based on the amount of gas consumption of the swap.

```
function swapKyber(
        IERC20Ext src,
        IERC20Ext dest,
        uint256 srcAmount,
        uint256 minConversionRate,
        address payable recipient,
        uint256 platformFeeBps,
        address payable platformWallet,
        bytes calldata hint,
        bool useGasToken
    ) external payable returns (uint256 destAmount);
```

- Swap on Uniswap, `platformWallet` must be added to the list supported platform wallets. If `userGasToken` is enabled, user must approve Proxy contract to use CHI token. Amount of CHI tokens to burn will be calculated automatically based on the amount of gas consumption of the swap.

```
function swapUniswap(
        IUniswapV2Router02 router,
        uint256 srcAmount,
        uint256 minDestAmount,
        address[] calldata tradePath,
        address payable recipient,
        uint256 platformFeeBps,
        address payable platformWallet,
        bool feeInSrc,
        bool useGasToken
    ) external payable returns (uint256 destAmount);
```

#### Earning/Lending

- **ISmartWalletLending.LendingPlatform**: 0: AAVE_V1, 1: AAVE_V2, 2: COMPOUND.

- Swap on Kyber, then deposit to AAVE v1, AAVE v2 and Compound. Allow user to swap on Kyber, then deposit all dest token to Lending platform. If `src == dest`, user deposits directly without swapping. Note: Fee could be applied when user deposits directly.
```
    function swapKyberAndDeposit(
        ISmartWalletLending.LendingPlatform platform,
        IERC20Ext src,
        IERC20Ext dest,
        uint256 srcAmount,
        uint256 minConversionRate,
        uint256 platformFeeBps,
        address payable platformWallet,
        bytes calldata hint,
        bool useGasToken
    ) external payable returns (uint256 destAmount);
```

 - Swap on Uniswap, then deposit to AAVE v1, AAVE v2 and Compound. Allow user to swap on Uniswap, then deposit all dest token to Lending platform. If `src == dest`, user deposits directly without swapping. Note: Fee will be taken in dest token for both direct deposit or swap & deposit.
```
    function swapUniswapAndDeposit(
        ISmartWalletLending.LendingPlatform platform,
        IUniswapV2Router02 router,
        uint256 srcAmount,
        uint256 minDestAmount,
        address[] calldata tradePath,
        uint256 platformFeeBps,
        address payable platformWallet,
        bool useGasToken
    ) external payable returns (uint256 destAmount);
```

- Swap on Kyber, then repay to AAVE v1, AAVE v2 and Compound. Allow user to swap on Kyber, then repay `payAmount` of dest token to Lending platform. If `src == dest`, user repays directly without swapping. Note: Fee could be applied when user repays directly.
```
    function swapKyberAndRepay(
        ISmartWalletLending.LendingPlatform platform,
        IERC20Ext src,
        IERC20Ext dest,
        uint256 srcAmount,
        uint256 payAmount,
        uint256 feeAndRateMode, // in case aave v2, fee: feeAndRateMode % BPS, rateMode: feeAndRateMode / BPS
        address payable platformWallet,
        bytes calldata hint,
        bool useGasToken
    ) external payable returns (uint256 destAmount);
```

 - Swap on Uniswap, then repay to AAVE v1, AAVE v2 and Compound. Allow user to swap on Uniswap, then repay all dest token to Lending platform. If `src == dest`, user repays directly without swapping. Note: Fee will be taken in dest token for both direct repay or swap & deposit.
```
    function swapUniswapAndRepay(
        ISmartWalletLending.LendingPlatform platform,
        IUniswapV2Router02 router,
        uint256 srcAmount,
        uint256 payAmount,
        address[] calldata tradePath,
        uint256 feeAndRateMode, // in case aave v2, fee: feeAndRateMode % BPS, rateMode: feeAndRateMode / BPS
        address payable platformWallet,
        bool useGasToken
    ) external payable returns (uint256 destAmount);
```


- Withdraw tokens from AAVE v1, AAVE v2 and COMPOUND, given token user wants to withdraw. Contract will get the corresponding aToken or cToken to collect from user's wallet, then burn these tokens to get back `token`.
```
    function withdrawFromLendingPlatform(
        ISmartWalletLending.LendingPlatform platform,
        IERC20Ext token,
        uint256 amount,
        uint256 minReturn,
        bool useGasToken
    ) external returns (uint256 returnedAmount);
```
 
