pragma solidity 0.6.6;

import "./ISmartWalletSwapImplementation.sol";
import "./SmartWalletSwapStorage.sol";
import "@kyber.network/utils-sc/contracts/IERC20Ext.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";


contract SmartWalletSwapImplementation is SmartWalletSwapStorage, ISmartWalletSwapImplementation {

    using SafeERC20 for IERC20Ext;
    using SafeMath for uint256;

    event KyberTrade(
        IERC20Ext indexed src,
        IERC20Ext indexed dest,
        uint256 srcAmount,
        uint256 minConversionRate,
        address recipient,
        uint256 platformFeeBps,
        address platformWallet,
        bytes hint,
        bool useGasToken,
        uint numberGasBurns
    );

    event UniswapTrade(
        address indexed router,
        address[] tradePath,
        uint256 srcAmount,
        uint256 minDestAmount,
        address recipient,
        uint256 platformFeeBps,
        address platformWallet,
        bool useGasToken,
        uint numberGasBurns
    );

    event SupportedPlatformWalletsUpdated(
        address[] indexed wallets,
        bool indexed isSupported
    );
    event UpdateKyberProxy(IKyberProxy indexed newProxy);
    event UpdateUniswapRouters(
        IUniswapV2Router02[] indexed uniswapRouters,
        bool isAdded
    );
    event ApproveAllowances(
        IERC20Ext[] indexed tokens,
        address[] indexed spenders,
        bool isReset
    );

    constructor(
        address _admin, IKyberProxy _kyberProxy,
        IUniswapV2Router02[] memory _uniswapRouters,
        IBurnGasHelper _burnGasHelper
    )
        public SmartWalletSwapStorage(_admin)
    {
        require(_kyberProxy != IKyberProxy(0), "invalid KyberProxy");
        for(uint256 i = 0; i < _uniswapRouters.length; i++) {
            require(_uniswapRouters[i] != IUniswapV2Router02(0), "invalid UniswapRouter");
            require(!isRouterSupported[_uniswapRouters[i]], "duplicated router");
            isRouterSupported[_uniswapRouters[i]] = true;
        }
        kyberProxy = _kyberProxy;
        burnGasHelper = _burnGasHelper;
    }

    function updateKyberProxy(IKyberProxy _kyberProxy) external onlyAdmin {
        require(_kyberProxy != IKyberProxy(0), "invalid KyberProxy");
        if (kyberProxy != _kyberProxy) {
            kyberProxy = _kyberProxy;
            emit UpdateKyberProxy(_kyberProxy);
        }
    }

    /// @dev can support to trade with Uniswap or its clone, for example: Sushiswap, SashimiSwap
    function updateUniswapRouters(
        IUniswapV2Router02[] calldata _uniswapRouters,
        bool isAdded
    )
        external onlyAdmin
    {
        for(uint256 i = 0; i < _uniswapRouters.length; i++) {
            require(_uniswapRouters[i] != IUniswapV2Router02(0), "invalid UniswapRouter");
            if (isAdded) {
                require(!isRouterSupported[_uniswapRouters[i]], "duplicated router");
                isRouterSupported[_uniswapRouters[i]] = true;
            } else {
                require(isRouterSupported[_uniswapRouters[i]], "router not found");
                isRouterSupported[_uniswapRouters[i]] = false;
            }
        }
        emit UpdateUniswapRouters(_uniswapRouters, isAdded);            
    }

    /// @dev to prevent other integrations to call trade from this contract
    function updateSupportedPlatformWallets(
        address[] calldata wallets,
        bool isSupported
    )
        external onlyAdmin
    {
        for(uint256 i = 0; i < wallets.length; i++) {
            supportedPlatformWallets[wallets[i]] = isSupported;
        }
        emit SupportedPlatformWalletsUpdated(wallets, isSupported);
    }

    function approveAllowances(
        IERC20Ext[] calldata tokens,
        address[] calldata spenders,
        bool isReset
    )
        external onlyAdmin
    {
        uint256 allowance = isReset ? 0 : MAX_ALLOWANCE;
        for(uint256 i = 0; i < tokens.length; i++) {
            for(uint256 j = 0; j < spenders.length; j++) {
                tokens[i].safeApprove(spenders[j], allowance);
            }
            getSetDecimals(tokens[i]);
        }

        emit ApproveAllowances(tokens, spenders, isReset);
    }

    /// @dev swap token via Kyber
    /// @notice for some tokens that are paying fee, for example: DGX
    /// contract will trade with received src token amount (after minus fee)
    /// for Kyber, fee will be taken in ETH as part of their feature
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
    ) external override nonReentrant payable returns (uint256 destAmount) {
        TradeInput memory input = TradeInput({
            srcAmount: srcAmount,
            srcAmountFee: 0,
            minData: minConversionRate,
            recipient: recipient,
            platformFeeBps: platformFeeBps,
            platformWallet: platformWallet,
            hint: hint,
            useGasToken: useGasToken,
            gasBeforeTrade: useGasToken ? gasleft() : 0
        });

        input.srcAmount = validateAndPrepareSourceAmount(src, srcAmount, platformWallet);
        destAmount = doKyberTrade(src, dest, input);
    }

    /// @dev swap token via a supported Uniswap router
    /// @notice for some tokens that are paying fee, for example: DGX
    /// contract will trade with received src token amount (after minus fee)
    /// for Uniswap, fee will be taken in src token
    function swapUniswap(
        IUniswapV2Router02 router,
        uint256 srcAmount,
        uint256 minDestAmount,
        address[] calldata tradePath,
        address payable recipient,
        uint256 platformFeeBps,
        address payable platformWallet,
        bool useGasToken
    ) external override nonReentrant payable returns (uint256 destAmount) {
        TradeInput memory input = TradeInput({
            srcAmount: srcAmount,
            srcAmountFee: 0,
            minData: minDestAmount,
            recipient: recipient,
            platformFeeBps: platformFeeBps,
            platformWallet: platformWallet,
            hint: "",
            useGasToken: useGasToken,
            gasBeforeTrade: useGasToken ? gasleft() : 0
        });

        // extra validation when swapping on Uniswap
        require(isRouterSupported[router], "router is not supported");
        require(platformFeeBps < BPS, "platform fee is too high");

        IERC20Ext src = IERC20Ext(tradePath[0]);

        input.srcAmount = validateAndPrepareSourceAmount(src, srcAmount, platformWallet);
        input.srcAmountFee = input.srcAmount.mul(platformFeeBps).div(BPS);

        destAmount = doUniswapTrade(
            router,
            src,
            tradePath,
            input
        );
    }

    /// @dev get expected return and conversion rate if using Kyber
    function getExpectedReturnKyber(
        IERC20Ext src,
        IERC20Ext dest,
        uint256 srcAmount,
        uint256 platformFee,
        bytes calldata hint
    ) external override view returns (
        uint256 destAmount,
        uint256 expectedRate
    ) {
        try kyberProxy.getExpectedRateAfterFee(
            src, dest, srcAmount, platformFee, hint
        ) returns (uint256 rate) {
            expectedRate = rate;
        } catch {
            expectedRate = 0;
        }
        destAmount = calcDestAmount(
            src,
            dest,
            srcAmount,
            expectedRate
        );
    }

    /// @dev get expected return and conversion rate if using a Uniswap router
    function getExpectedReturnUniswap(
        IUniswapV2Router02 router,
        uint256 srcAmount,
        address[] calldata tradePath,
        uint256 platformFee
    ) external override view returns (
        uint256 destAmount,
        uint256 expectedRate
    ) {
        if (platformFee >= BPS) return (0, 0); // platform fee is too high
        if (!isRouterSupported[router]) return (0, 0); // router is not supported
        uint256 srcAmountAfterFee = srcAmount * (BPS - platformFee) / BPS;
        if (srcAmountAfterFee == 0) return (0, 0);
        // in case pair is not supported
        try router.getAmountsOut(srcAmountAfterFee, tradePath)
            returns(uint256[] memory amounts) {
            destAmount = amounts[tradePath.length - 1];
            
        } catch {
            destAmount = 0;
        }
        expectedRate = calcRateFromQty(
            srcAmountAfterFee,
            destAmount,
            getDecimals(IERC20Ext(tradePath[0])),
            getDecimals(IERC20Ext(tradePath[tradePath.length - 1]))
        );
    }

    function doKyberTrade(
        IERC20Ext src,
        IERC20Ext dest,
        TradeInput memory input
    ) internal virtual returns (uint256 destAmount) {
        uint256 callValue = src == ETH_TOKEN_ADDRESS ? input.srcAmount : 0;
        destAmount = kyberProxy.tradeWithHintAndFee{ value: callValue }(
            src,
            input.srcAmount,
            dest,
            input.recipient,
            MAX_AMOUNT,
            input.minData,
            input.platformWallet,
            input.platformFeeBps,
            input.hint
        );

        uint256 numberGasBurns = 0;
        // burn gas token if needed
        if (input.useGasToken && burnGasHelper != IBurnGasHelper(0)) {
            address[] memory path = new address[](2);
            path[0] = address(src);
            path[1] = address(dest);
            numberGasBurns = burnGasTokensAfterTrade(
                address(kyberProxy),
                input.srcAmount,
                path,
                input.recipient,
                input.platformFeeBps,
                input.platformWallet,
                input.hint,
                input.gasBeforeTrade
            );
        }

        emit KyberTrade(
            src,
            dest,
            input.srcAmount,
            input.minData,
            input.recipient,
            input.platformFeeBps,
            input.platformWallet,
            input.hint,
            input.useGasToken,
            numberGasBurns
        );
    }

    function doUniswapTrade(
        IUniswapV2Router02 router,
        IERC20Ext src,
        address[] memory tradePath,
        TradeInput memory input
    ) internal virtual returns (uint256 destAmount) {
        // convert eth -> weth address
        address[] memory path = tradePath;
        for(uint256 i = 0; i < tradePath.length; i++) {
            if (tradePath[i] == address(ETH_TOKEN_ADDRESS)) {
                path[i] = router.WETH();
            }
        }

        uint256[] memory amounts;
        uint256 srcAmountAfterFee = input.srcAmount.sub(input.srcAmountFee);
        if (src == ETH_TOKEN_ADDRESS) {
            // swap eth -> token
            amounts = router.swapExactETHForTokens{ value: srcAmountAfterFee }(
                input.minData, path, input.recipient, MAX_AMOUNT
            );
        } else {
            if (IERC20Ext(tradePath[tradePath.length - 1]) == ETH_TOKEN_ADDRESS) {
                // swap token -> eth
                amounts = router.swapExactTokensForETH(
                    srcAmountAfterFee,
                    input.minData,
                    path,
                    input.recipient,
                    MAX_AMOUNT
                );
            } else {
                // swap token -> token
                amounts = router.swapExactTokensForTokens(
                    srcAmountAfterFee,
                    input.minData,
                    path,
                    input.recipient,
                    MAX_AMOUNT
                );
            }
        }
        destAmount = amounts[path.length - 1];
        uint256 numberGasBurns = 0;
        if (input.useGasToken && burnGasHelper != IBurnGasHelper(0)) {
            numberGasBurns = burnGasTokensAfterTrade(
                address(router),
                input.srcAmount,
                tradePath,
                input.recipient,
                input.platformFeeBps,
                input.platformWallet,
                "",
                input.gasBeforeTrade
            );
        }

        emit UniswapTrade(
            address(router),
            tradePath,
            input.srcAmount,
            input.minData,
            input.recipient,
            input.platformFeeBps,
            input.platformWallet,
            input.useGasToken,
            numberGasBurns
        );
    }

    function validateAndPrepareSourceAmount(
        IERC20Ext src,
        uint256 srcAmount,
        address platformWallet
    ) internal virtual returns(uint256 actualSrcAmount) {
        require(supportedPlatformWallets[platformWallet], "unsupported platform wallet");
        if (src == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount, "wrong msg value");
            actualSrcAmount = srcAmount;
        } else {
            require(msg.value == 0, "bad msg value");
            uint256 balanceBefore = src.balanceOf(address(this));
            src.safeTransferFrom(msg.sender, address(this), srcAmount);
            uint256 balanceAfter = src.balanceOf(address(this));
            require(balanceAfter >= balanceBefore, "invalid balance");
            // prevent case of token with fee
            actualSrcAmount = balanceAfter - balanceBefore;
        }
    }

    function burnGasTokensAfterTrade(
        address protocol,
        uint256 srcAmount,
        address[] memory path,
        address recipient,
        uint256 platformFeeBps,
        address platformWallet,
        bytes memory hint,
        uint256 gasBefore
    ) internal virtual returns(uint256 numBurnTokens) {
        IGasToken gasToken;
        uint256 gasAfter = gasleft();

        try burnGasHelper.getAmountGasTokensToBurn(
            msg.sender,
            protocol,
            srcAmount,
            path,
            recipient,
            platformFeeBps,
            platformWallet,
            hint,
            gasBefore.sub(gasAfter)
        ) returns(uint _gasBurns, address _gasToken) {
            numBurnTokens = _gasBurns;
            gasToken = IGasToken(_gasToken);
        } catch {
            numBurnTokens = 0;
        }

        if (numBurnTokens > 0 && gasToken != IGasToken(0)) {
            numBurnTokens = gasToken.freeFromUpTo(msg.sender, numBurnTokens);
        }
    }
}
