pragma solidity 0.6.6;

import "./ISmartWalletSwapImplementation.sol";
import "./SmartWalletSwapStorage.sol";
import "@kyber.network/utils-sc/contracts/IERC20Ext.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";


contract SmartWalletSwapImplementation is SmartWalletSwapStorage, ISmartWalletSwapImplementation {

    using SafeERC20 for IERC20Ext;
    using SafeMath for uint256;

    event SupportedPlatformWalletsUpdated(
        address[] indexed wallets,
        bool indexed isSupported
    );
    event UpdateKyberProxy(IKyberProxy indexed newProxy);
    event UpdateUniswapRouters(
        IUniswapV2Router02[] indexed uniswapRouters,
        bool isAdded
    );
    event UpdatedBurnGasHelper(IBurnGasHelper indexed gasHelper);
    event UpdatedLendingImplementation(ISmartWalletLending indexed impl);
    event ApproveAllowances(
        IERC20Ext[] indexed tokens,
        address[] indexed spenders,
        bool isReset
    );

    constructor(address _admin) public SmartWalletSwapStorage(_admin) {}

    receive() external payable {}

    function updateBurnGasHelper(IBurnGasHelper _burnGasHelper) external onlyAdmin {
        if (burnGasHelper != _burnGasHelper) {
            burnGasHelper = _burnGasHelper;
            emit UpdatedBurnGasHelper(_burnGasHelper);
        }
    }

    function updateKyberProxy(IKyberProxy _kyberProxy) external onlyAdmin {
        require(_kyberProxy != IKyberProxy(0), "invalid KyberProxy");
        if (kyberProxy != _kyberProxy) {
            kyberProxy = _kyberProxy;
            emit UpdateKyberProxy(_kyberProxy);
        }
    }

    function updateLendingImplementation(
        ISmartWalletLending newImpl
    ) external onlyAdmin {
        require(newImpl != ISmartWalletLending(0), "invalid lending impl");
        lendingImpl = newImpl;
        emit UpdatedLendingImplementation(newImpl);
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
                isRouterSupported[_uniswapRouters[i]] = true;
            } else {
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

    /// ========== SWAP ========== ///

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
    )
        external override nonReentrant payable
        returns (uint256 destAmount)
    {
        uint256 gasBefore = useGasToken ? gasleft() : 0;
        destAmount = doKyberTrade(
            src,
            dest,
            srcAmount,
            minConversionRate,
            recipient,
            platformFeeBps,
            platformWallet,
            hint
        );
        uint256 numberGasBurns = 0;
        // burn gas token if needed
        if (useGasToken) {
            numberGasBurns = burnGasTokensAfterTrade(gasBefore);
        }
        emit KyberTrade(
            msg.sender,
            src,
            dest,
            srcAmount,
            destAmount,
            recipient,
            platformFeeBps,
            platformWallet,
            hint,
            useGasToken,
            numberGasBurns
        );
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
        uint256 gasBefore = useGasToken ? gasleft() : 0;
        destAmount = swapUniswapInternal(
            router,
            srcAmount,
            minDestAmount,
            tradePath,
            recipient,
            platformFeeBps,
            platformWallet
        );
        uint256 numberGasBurns = 0;
        if (useGasToken) {
            numberGasBurns = burnGasTokensAfterTrade(gasBefore);
        }

        emit UniswapTrade(
            msg.sender,
            address(router),
            tradePath,
            srcAmount,
            destAmount,
            recipient,
            platformFeeBps,
            platformWallet,
            useGasToken,
            numberGasBurns
        );
    }

    /// ========== SWAP & DEPOSIT ========== ///

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
    )
        external override nonReentrant payable returns (uint256 destAmount)
    {
        require(lendingImpl != ISmartWalletLending(0));
        uint256 gasBefore = useGasToken ? gasleft() : 0;
        if (src == dest) {
            // just collect src token, no need to swap
            destAmount = safeForwardToken(
                src,
                msg.sender,
                payable(address(lendingImpl)),
                srcAmount
            );
        } else {
            destAmount = doKyberTrade(
                src,
                dest,
                srcAmount,
                minConversionRate,
                payable(address(lendingImpl)),
                platformFeeBps,
                platformWallet,
                hint
            );
        }

        // eth or token alr transferred to the address
        lendingImpl.depositTo(platform, msg.sender, dest, destAmount);

        uint256 numberGasBurns = 0;
        if (useGasToken) {
            numberGasBurns = burnGasTokensAfterTrade(gasBefore);
        }

        // depositAndBurnGas(platform, dest, destAmount, useGasToken, gasBefore);
        // TODO: Emit event
    }

    /// @dev swap Uniswap then deposit to platform
    ///     if tradePath has only 1 token, don't need to do swap
    /// @param platform platform to deposit
    /// @param router which Uni-clone to use for swapping
    /// @param srcAmount amount of src token
    /// @param minDestAmount minimal accepted dest amount
    /// @param tradePath path of the trade on Uniswap
    /// @param platformFeeBps fee if swapping
    /// @param platformWallet wallet to receive fee
    /// @param useGasToken whether to use gas token or not
    function swapUniswapAndDeposit(
        ISmartWalletLending.LendingPlatform platform,
        IUniswapV2Router02 router,
        uint256 srcAmount,
        uint256 minDestAmount,
        address[] calldata tradePath,
        uint256 platformFeeBps,
        address payable platformWallet,
        bool useGasToken
    )
        external override nonReentrant payable returns (uint256 destAmount)
    {
        require(lendingImpl != ISmartWalletLending(0));
        uint256 gasBefore = useGasToken ? gasleft() : 0;
        IERC20Ext dest = IERC20Ext(tradePath[tradePath.length - 1]);
        if (tradePath.length == 1) {
            // just collect src token, no need to swap
            destAmount = safeForwardToken(
                dest,
                msg.sender,
                payable(address(lendingImpl)),
                srcAmount
            );
        } else {
            destAmount = swapUniswapInternal(
                router,
                srcAmount,
                minDestAmount,
                tradePath,
                payable(address(lendingImpl)),
                platformFeeBps,
                platformWallet
            );
        }

        // eth or token alr transferred to the address
        lendingImpl.depositTo(platform, msg.sender, dest, destAmount);

        uint256 numberGasBurns = 0;
        if (useGasToken) {
            numberGasBurns = burnGasTokensAfterTrade(gasBefore);
        }
        // depositAndBurnGas(platform, dest, destAmount, useGasToken, gasBefore);
        // TODO: Emit event
    }

    /// @dev withdraw token from Lending platforms (AAVE, COMPOUND)
    /// @param platform platform to withdraw token
    /// @param token underlying token to withdraw, e.g ETH, USDT, DAI
    /// @param amount amount of cToken (COMPOUND) or aToken (AAVE) to withdraw
    /// @param useGasToken whether to use gas token or not
    function withdrawFromLendingPlatform(
        ISmartWalletLending.LendingPlatform platform,
        IERC20Ext token,
        uint256 amount,
        bool useGasToken
    )
        external override nonReentrant returns (uint256 returnedAmount)
    {
        require(lendingImpl != ISmartWalletLending(0));
        uint256 gasBefore = useGasToken ? gasleft() : 0;
        address lendingToken = lendingImpl.getLendingToken(platform, token);
        require(lendingToken != address(0), "token not supported");
        IERC20Ext(lendingToken).safeTransferFrom(msg.sender, address(lendingImpl), amount);

        returnedAmount = lendingImpl.withdrawFrom(platform, msg.sender, token, amount);

        uint256 numGasBurns;
        if (useGasToken) {
            numGasBurns = burnGasTokensAfterTrade(gasBefore);
        }
        // TODO: Emit event
    }

    function swapKyberAndRepay(
        ISmartWalletLending.LendingPlatform platform,
        IERC20Ext src,
        IERC20Ext dest,
        uint256 srcAmount,
        uint256 payAmount,
        uint256 platformFeeBps,
        address payable platformWallet,
        bytes calldata hint,
        bool useGasToken
    )
        external override nonReentrant payable returns (uint256 destAmount)
    {
        require(lendingImpl != ISmartWalletLending(0));
        uint256 gasBefore = useGasToken ? gasleft() : 0;
        if (src == dest) {
            // just collect src token, no need to swap
            destAmount = safeForwardToken(
                src,
                msg.sender,
                payable(address(lendingImpl)),
                srcAmount
            );
        } else {
            destAmount = doKyberTrade(
                src,
                dest,
                srcAmount,
                0,
                payable(address(lendingImpl)),
                platformFeeBps,
                platformWallet,
                hint
            );
        }
        lendingImpl.repayBorrowTo(platform, msg.sender, dest, destAmount, payAmount, 0);

        uint256 numGasBurns;
        if (useGasToken) {
            numGasBurns = burnGasTokensAfterTrade(gasBefore);
        }
        // TODO: Emit event
    }

    function swapUniswapAndRepay(
        ISmartWalletLending.LendingPlatform platform,
        IUniswapV2Router02 router,
        uint256 srcAmount,
        uint256 payAmount,
        address[] calldata tradePath,
        uint256 platformFeeBps,
        address payable platformWallet,
        bool useGasToken
    )
        external override nonReentrant payable returns (uint256 destAmount)
    {
        require(lendingImpl != ISmartWalletLending(0));
        uint256 gasBefore = useGasToken ? gasleft() : 0;
        IERC20Ext dest = IERC20Ext(tradePath[tradePath.length - 1]);
        if (tradePath.length == 1) {
            // just collect src token, no need to swap
            destAmount = safeForwardToken(
                dest,
                msg.sender,
                payable(address(lendingImpl)),
                srcAmount
            );
        } else {
            destAmount = swapUniswapInternal(
                router,
                srcAmount,
                payAmount,
                tradePath,
                payable(address(lendingImpl)),
                platformFeeBps,
                platformWallet
            );
        }
        lendingImpl.repayBorrowTo(platform, msg.sender, dest, destAmount, payAmount, 0);

        uint256 numGasBurns;
        if (useGasToken) {
            numGasBurns = burnGasTokensAfterTrade(gasBefore);
        }
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
        uint256 srcAmount,
        uint256 minConversionRate,
        address payable recipient,
        uint256 platformFeeBps,
        address payable platformWallet,
        bytes memory hint
    ) internal virtual returns (uint256 destAmount) {
        uint256 actualSrcAmount = validateAndPrepareSourceAmount(
            address(kyberProxy),
            src,
            srcAmount,
            platformWallet
        );
        uint256 callValue = src == ETH_TOKEN_ADDRESS ? actualSrcAmount : 0;
        destAmount = kyberProxy.tradeWithHintAndFee{ value: callValue }(
            src,
            actualSrcAmount,
            dest,
            recipient,
            MAX_AMOUNT,
            minConversionRate,
            platformWallet,
            platformFeeBps,
            hint
        );
    }

    function swapUniswapInternal(
        IUniswapV2Router02 router,
        uint256 srcAmount,
        uint256 minDestAmount,
        address[] memory tradePath,
        address payable recipient,
        uint256 platformFeeBps,
        address payable platformWallet
    ) internal returns (uint256 destAmount) {
        TradeInput memory input = TradeInput({
            srcAmount: srcAmount,
            srcAmountFee: 0,
            minData: minDestAmount,
            recipient: recipient,
            platformFeeBps: platformFeeBps,
            platformWallet: platformWallet,
            hint: ""
        });

        // extra validation when swapping on Uniswap
        require(isRouterSupported[router], "router is not supported");
        require(platformFeeBps < BPS, "platform fee is too high");

        IERC20Ext src = IERC20Ext(tradePath[0]);

        input.srcAmount = validateAndPrepareSourceAmount(
            address(router),
            src,
            srcAmount,
            platformWallet
        );
        input.srcAmountFee = input.srcAmount.mul(platformFeeBps).div(BPS);

        destAmount = doUniswapTrade(
            router,
            src,
            tradePath,
            input
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

        if (input.platformWallet != address(this) && input.srcAmountFee > 0) {
            // transfer fee to platform wallet
            if (src == ETH_TOKEN_ADDRESS) {
                (bool success, ) = input.platformWallet.call{ value: input.srcAmountFee }("");
                require(success, "transfer eth to platform wallet failed");
            } else {
                src.safeTransfer(input.platformWallet, input.srcAmountFee);
            }
        }

        destAmount = amounts[path.length - 1];
    }

    function validateAndPrepareSourceAmount(
        address protocol,
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
            actualSrcAmount = balanceAfter.sub(balanceBefore);
            require(actualSrcAmount > 0);

            safeApproveAllowance(protocol, src);
        }
    }

    function burnGasTokensAfterTrade(uint256 gasBefore)
        internal virtual
        returns(uint256 numBurnTokens)
    {
        if (burnGasHelper == IBurnGasHelper(0)) return 0;
        IGasToken gasToken;
        uint256 gasAfter = gasleft();

        try burnGasHelper.getAmountGasTokensToBurn(
            gasBefore.sub(gasAfter),
            msg.data // forward all data
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

    function safeForwardToken(IERC20Ext token, address from, address payable to, uint256 amount)
        internal returns (uint destAmount)
    {
        if (token == ETH_TOKEN_ADDRESS) {
            require(msg.value >= amount);
            (bool success, ) = to.call { value: amount }("");
            require(success, "transfer eth failed");
            destAmount = amount;
        } else {
            uint256 balanceBefore = token.balanceOf(to);
            token.safeTransferFrom(from, to, amount);
            uint256 balanceAfter = token.balanceOf(to);
            destAmount = balanceAfter.sub(balanceBefore);
        }
    }

    function safeApproveAllowance(address spender, IERC20Ext token) internal {
        if (token.allowance(address(this), spender) == 0) {
            token.safeApprove(spender, MAX_ALLOWANCE);
        }
    }

    function transferToken(address payable recipient, IERC20Ext token, uint256 amount) internal {
        if (token == ETH_TOKEN_ADDRESS) {
            (bool success, ) = recipient.call { value: amount }("");
            require(success, "failed to transfer eth");
        } else {
            token.safeTransfer(recipient, amount);
        }
    }
}
