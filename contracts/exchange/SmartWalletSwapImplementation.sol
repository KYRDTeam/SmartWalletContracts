pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@kyber.network/utils-sc/contracts/IBEP20.sol";
import "../interfaces/ISmartWalletSwapImplementation.sol";
import "../interfaces/IPancakeRouter02.sol";
import "./SmartWalletSwapStorage.sol";


contract SmartWalletSwapImplementation is SmartWalletSwapStorage, ISmartWalletSwapImplementation {
    using SafeERC20 for IBEP20;
    using SafeMath for uint256;

    event UpdatedSupportedPlatformWallets(address[] wallets, bool isSupported);
    event UpdatedLendingImplementation(ISmartWalletLending impl);
    event ApprovedAllowances(IBEP20[] tokens, address[] spenders, bool isReset);
    event ClaimedPlatformFees(address[] wallets, IBEP20[] tokens, address claimer);

    constructor(address _admin) SmartWalletSwapStorage(_admin) {}

    receive() external payable {}

    function updateLendingImplementation(ISmartWalletLending newImpl) external onlyAdmin {
        require(newImpl != ISmartWalletLending(0), "invalid lending impl");
        lendingImpl = newImpl;
        emit UpdatedLendingImplementation(newImpl);
    }

    /// @dev to prevent other integrations to call trade from this contract
    function updateSupportedPlatformWallets(address[] calldata wallets, bool isSupported)
        external
        onlyAdmin
    {
        for (uint256 i = 0; i < wallets.length; i++) {
            supportedPlatformWallets[wallets[i]] = isSupported;
        }
        emit UpdatedSupportedPlatformWallets(wallets, isSupported);
    }

    function claimPlatformFees(address[] calldata platformWallets, IBEP20[] calldata tokens)
        external
        override
        nonReentrant
    {
        for (uint256 i = 0; i < platformWallets.length; i++) {
            for (uint256 j = 0; j < tokens.length; j++) {
                uint256 fee = platformWalletFees[platformWallets[i]][tokens[j]];
                if (fee > 1) {
                    platformWalletFees[platformWallets[i]][tokens[j]] = 1;
                    transferToken(payable(platformWallets[i]), tokens[j], fee - 1);
                }
            }
        }
        emit ClaimedPlatformFees(platformWallets, tokens, msg.sender);
    }

    function approveAllowances(
        IBEP20[] calldata tokens,
        address[] calldata spenders,
        bool isReset
    ) external onlyAdmin {
        uint256 allowance = isReset ? 0 : MAX_ALLOWANCE;
        for (uint256 i = 0; i < tokens.length; i++) {
            for (uint256 j = 0; j < spenders.length; j++) {
                tokens[i].safeApprove(spenders[j], allowance);
            }
            getSetDecimals(tokens[i]);
        }

        emit ApprovedAllowances(tokens, spenders, isReset);
    }

    /// ========== SWAP ========== ///

    /// @dev swap token via Kyber
    /// @notice for some tokens that are paying fee, for example: DGX
    /// contract will trade with received src token amount (after minus fee)
    /// for Kyber, fee will be taken in ETH as part of their feature
    function swapKyber(
        IBEP20 src,
        IBEP20 dest,
        uint256 srcAmount,
        uint256 minConversionRate,
        address payable recipient,
        address payable platformWallet
    ) external payable override nonReentrant returns (uint256 destAmount) {
        destAmount = doKyberTrade(
            src,
            dest,
            srcAmount,
            minConversionRate,
            recipient,
            platformWallet
        );

        emit KyberTrade(
            msg.sender,
            src,
            dest,
            srcAmount,
            destAmount,
            recipient,
            platformWallet
        );
    }

    /// @dev swap token via a supported PancakeSwap router
    /// @notice for some tokens that are paying fee, for example: DGX
    /// contract will trade with received src token amount (after minus fee)
    /// for PancakeSwap, fee will be taken in src token
    function swapPancake(
        IPancakeRouter02 router,
        uint256 srcAmount,
        uint256 minDestAmount,
        address[] calldata tradePath,
        address payable recipient,
        uint256 platformFeeBps,
        address payable platformWallet,
        bool feeInSrc
    ) external payable override nonReentrant returns (uint256 destAmount) {
        {
            // prevent stack too deep
            destAmount = swapPancakeInternal(
                router,
                srcAmount,
                minDestAmount,
                tradePath,
                recipient,
                platformFeeBps,
                platformWallet,
                feeInSrc
            );
        }

        emit PancakeTrade(
            msg.sender,
            address(router),
            tradePath,
            srcAmount,
            destAmount,
            recipient,
            platformFeeBps,
            platformWallet,
            feeInSrc
        );
    }

    /// ========== SWAP & DEPOSIT ========== ///

    function swapKyberAndDeposit(
        ISmartWalletLending.LendingPlatform platform,
        IBEP20 src,
        IBEP20 dest,
        uint256 srcAmount,
        uint256 minConversionRate,
        uint256 platformFeeBps,
        address payable platformWallet
    ) external payable override nonReentrant returns (uint256 destAmount) {
        require(lendingImpl != ISmartWalletLending(0));

        if (src == dest) {
            // just collect src token, no need to swap
            destAmount = safeForwardTokenAndCollectFee(
                src,
                msg.sender,
                payable(address(lendingImpl)),
                srcAmount,
                platformFeeBps,
                platformWallet
            );
        } else {
            destAmount = doKyberTrade(
                src,
                dest,
                srcAmount,
                minConversionRate,
                payable(address(lendingImpl)),
                platformWallet
            );
        }

        // eth or token alr transferred to the address
        lendingImpl.depositTo(platform, msg.sender, dest, destAmount);

        emit KyberTradeAndDeposit(
            msg.sender,
            platform,
            src,
            dest,
            srcAmount,
            destAmount,
            platformFeeBps,
            platformWallet
        );
    }

    /// @dev swap Pancake then deposit to platform
    ///     if tradePath has only 1 token, don't need to do swap
    /// @param platform platform to deposit
    /// @param router which Uni-clone to use for swapping
    /// @param srcAmount amount of src token
    /// @param minDestAmount minimal accepted dest amount
    /// @param tradePath path of the trade on Pancake
    /// @param platformFeeBps fee if swapping
    /// @param platformWallet wallet to receive fee
    function swapPancakeAndDeposit(
        ISmartWalletLending.LendingPlatform platform,
        IPancakeRouter02 router,
        uint256 srcAmount,
        uint256 minDestAmount,
        address[] calldata tradePath,
        uint256 platformFeeBps,
        address payable platformWallet
    ) external payable override nonReentrant returns (uint256 destAmount) {
        require(lendingImpl != ISmartWalletLending(0));

        {
            IBEP20 dest = IBEP20(tradePath[tradePath.length - 1]);
            if (tradePath.length == 1) {
                // just collect src token, no need to swap
                destAmount = safeForwardTokenAndCollectFee(
                    dest,
                    msg.sender,
                    payable(address(lendingImpl)),
                    srcAmount,
                    platformFeeBps,
                    platformWallet
                );
            } else {
                destAmount = swapPancakeInternal(
                    router,
                    srcAmount,
                    minDestAmount,
                    tradePath,
                    payable(address(lendingImpl)),
                    platformFeeBps,
                    platformWallet,
                    false
                );
            }

            // eth or token alr transferred to the address
            lendingImpl.depositTo(platform, msg.sender, dest, destAmount);
        }

        emit PancakeTradeAndDeposit(
            msg.sender,
            platform,
            router,
            tradePath,
            srcAmount,
            destAmount,
            platformFeeBps,
            platformWallet
        );
    }

    /// @dev withdraw token from Lending platforms (VENUS)
    /// @param platform platform to withdraw token
    /// @param token underlying token to withdraw, e.g ETH, USDT, DAI
    /// @param amount amount of vToken (VENUS) to withdraw
    /// @param minReturn minimum amount of USDT tokens to return
    /// @return returnedAmount returns the amount withdrawn to the user
    function withdrawFromLendingPlatform(
        ISmartWalletLending.LendingPlatform platform,
        IBEP20 token,
        uint256 amount,
        uint256 minReturn
    ) external override nonReentrant returns (uint256 returnedAmount) {
        require(lendingImpl != ISmartWalletLending(0));

        IBEP20 lendingToken = IBEP20(lendingImpl.getLendingToken(platform, token));
        require(lendingToken != IBEP20(0), "unsupported token");

        uint256 tokenBalanceBefore = lendingToken.balanceOf(address(lendingImpl));
        lendingToken.safeTransferFrom(msg.sender, address(lendingImpl), amount);
        uint256 tokenBalanceAfter = lendingToken.balanceOf(address(lendingImpl));

        returnedAmount = lendingImpl.withdrawFrom(
            platform,
            msg.sender,
            token,
            tokenBalanceAfter.sub(tokenBalanceBefore),
            minReturn
        );

        emit WithdrawFromLending(
            platform,
            token,
            amount,
            minReturn,
            returnedAmount
        );
    }

    /// @dev swap on Kyber and repay borrow for sender
    /// if src == dest, no need to swap, use src token to repay directly
    /// @param payAmount: amount that user wants to pay, if the dest amount (after swap) is higher,
    ///     the remain amount will be sent back to user's wallet
    /// Other params are params for trade on Kyber
    function swapKyberAndRepay(
        ISmartWalletLending.LendingPlatform platform,
        IBEP20 src,
        IBEP20 dest,
        uint256 srcAmount,
        uint256 payAmount,
        address payable platformWallet
    ) external payable override nonReentrant returns (uint256 destAmount) {
        {
            require(lendingImpl != ISmartWalletLending(0));

            {
                // use user debt value if debt is <= payAmount,
                // user can pay all debt by putting really high payAmount as param
                payAmount = checkUserDebt(platform, address(dest), payAmount);
                if (src == dest) {
                    if (src == BNB_TOKEN_ADDRESS) {
                        require(msg.value == srcAmount, "invalid msg value");
                        transferToken(payable(address(lendingImpl)), src, srcAmount);
                    } else {
                        destAmount = srcAmount > payAmount ? payAmount : srcAmount;
                        src.safeTransferFrom(msg.sender, address(lendingImpl), destAmount);
                    }
                } else {
                    // use user debt value if debt is <= payAmount
                    payAmount = checkUserDebt(platform, address(dest), payAmount);

                    // use min rate so it can return earlier if failed to swap
                    uint256 minRate =
                        calcRateFromQty(srcAmount, payAmount, src.decimals(), dest.decimals());

                    destAmount = doKyberTrade(
                        src,
                        dest,
                        srcAmount,
                        minRate,
                        payable(address(lendingImpl)),
                        platformWallet
                    );
                }
            }

            lendingImpl.repayBorrowTo(
                platform,
                msg.sender,
                dest,
                destAmount,
                payAmount
            );
        }

        emit KyberTradeAndRepay(
            msg.sender,
            platform,
            src,
            dest,
            srcAmount,
            destAmount,
            payAmount,
            platformWallet
        );
    }

    /// @dev swap on Uni-clone and repay borrow for sender
    /// if tradePath.length == 1, no need to swap, use tradePath[0] token to repay directly
    /// @param payAmount: amount that user wants to pay, if the dest amount (after swap) is higher,
    ///     the remain amount will be sent back to user's wallet
    /// @param feeAndRateMode: user needs to specify the rateMode to repay
    ///     to prevent stack too deep, combine fee and rateMode into a single value
    ///     platformFee: feeAndRateMode % BPS, rateMode: feeAndRateMode / BPS
    /// Other params are params for trade on Uni-clone
    function swapPancakeAndRepay(
        ISmartWalletLending.LendingPlatform platform,
        IPancakeRouter02 router,
        uint256 srcAmount,
        uint256 payAmount,
        address[] calldata tradePath,
        uint256 feeAndRateMode,
        address payable platformWallet
    ) external payable override nonReentrant returns (uint256 destAmount) {
        {
            // scope to prevent stack too deep
            require(lendingImpl != ISmartWalletLending(0));
            IBEP20 dest = IBEP20(tradePath[tradePath.length - 1]);

            // use user debt value if debt is <= payAmount
            // user can pay all debt by putting really high payAmount as param
            payAmount = checkUserDebt(platform, address(dest), payAmount);
            if (tradePath.length == 1) {
                if (dest == BNB_TOKEN_ADDRESS) {
                    require(msg.value == srcAmount, "invalid msg value");
                    transferToken(payable(address(lendingImpl)), dest, srcAmount);
                } else {
                    destAmount = srcAmount > payAmount ? payAmount : srcAmount;
                    dest.safeTransferFrom(msg.sender, address(lendingImpl), destAmount);
                }
            } else {
                destAmount = swapPancakeInternal(
                    router,
                    srcAmount,
                    payAmount,
                    tradePath,
                    payable(address(lendingImpl)),
                    feeAndRateMode % BPS,
                    platformWallet,
                    false
                );
            }

            lendingImpl.repayBorrowTo(
                platform,
                msg.sender,
                dest,
                destAmount,
                payAmount
            );
        }

        emit PancakeTradeAndRepay(
            msg.sender,
            platform,
            router,
            tradePath,
            srcAmount,
            destAmount,
            payAmount,
            feeAndRateMode,
            platformWallet
        );
    }

    /// @dev get expected return and conversion rate if using Kyber
    function getExpectedReturnKyber(
        IBEP20 src,
        IBEP20 dest,
        uint256 srcAmount
    ) external view override returns (uint256 destAmount, uint256 expectedRate) {
        try kyberProxy.getConversionRate(src, dest, srcAmount, block.number) returns (
            uint256 rate
        ) {
            expectedRate = rate;
        } catch {
            expectedRate = 0;
        }
        destAmount = calcDestAmount(src, dest, srcAmount, expectedRate);
    }

    /// @dev get expected return and conversion rate if using a Pancake router
    function getExpectedReturnPancake(
        IPancakeRouter02 router,
        uint256 srcAmount,
        address[] calldata tradePath,
        uint256 platformFee
    ) external view override returns (uint256 destAmount, uint256 expectedRate) {
        if (platformFee >= BPS) return (0, 0); // platform fee is too high
        if (!isRouterSupported[router]) return (0, 0); // router is not supported
        uint256 srcAmountAfterFee = (srcAmount * (BPS - platformFee)) / BPS;
        if (srcAmountAfterFee == 0) return (0, 0);
        // in case pair is not supported
        try router.getAmountsOut(srcAmountAfterFee, tradePath) returns (uint256[] memory amounts) {
            destAmount = amounts[tradePath.length - 1];
        } catch {
            destAmount = 0;
        }
        expectedRate = calcRateFromQty(
            srcAmountAfterFee,
            destAmount,
            getDecimals(IBEP20(tradePath[0])),
            getDecimals(IBEP20(tradePath[tradePath.length - 1]))
        );
    }

    function checkUserDebt(
        ISmartWalletLending.LendingPlatform platform,
        address token,
        uint256 amount
    ) internal returns (uint256) {
        uint256 debt = lendingImpl.storeAndRetrieveUserDebtCurrent(platform, token, msg.sender);

        if (debt >= amount) {
            return amount;
        }

        return debt;
    }

    function doKyberTrade(
        IBEP20 src,
        IBEP20 dest,
        uint256 srcAmount,
        uint256 minConversionRate,
        address payable recipient,
        address payable platformWallet
    ) internal virtual returns (uint256 destAmount) {
        uint256 actualSrcAmount =
            validateAndPrepareSourceAmount(address(kyberProxy), src, srcAmount, platformWallet);
        uint256 callValue = src == BNB_TOKEN_ADDRESS ? actualSrcAmount : 0;
        destAmount = kyberProxy.trade{value: callValue}(
            src,
            actualSrcAmount,
            dest,
            recipient,
            minConversionRate
        );
    }

    function swapPancakeInternal(
        IPancakeRouter02 router,
        uint256 srcAmount,
        uint256 minDestAmount,
        address[] memory tradePath,
        address payable recipient,
        uint256 platformFeeBps,
        address payable platformWallet,
        bool feeInSrc
    ) internal returns (uint256 destAmount) {
        TradeInput memory input =
            TradeInput({
                srcAmount: srcAmount,
                minData: minDestAmount,
                recipient: recipient,
                platformFeeBps: platformFeeBps,
                platformWallet: platformWallet,
                hint: ""
            });

        // extra validation when swapping on Pancake
        require(isRouterSupported[router], "unsupported router");
        require(platformFeeBps < BPS, "high platform fee");

        IBEP20 src = IBEP20(tradePath[0]);

        input.srcAmount = validateAndPrepareSourceAmount(
            address(router),
            src,
            srcAmount,
            platformWallet
        );

        destAmount = doPancakeTrade(router, src, tradePath, input, feeInSrc);
    }

    function doPancakeTrade(
        IPancakeRouter02 router,
        IBEP20 src,
        address[] memory tradePath,
        TradeInput memory input,
        bool feeInSrc
    ) internal virtual returns (uint256 destAmount) {
        uint256 tradeLen = tradePath.length;
        IBEP20 actualDest = IBEP20(tradePath[tradeLen - 1]);
        {
            // convert eth -> weth address to trade on Pancake
            if (tradePath[0] == address(BNB_TOKEN_ADDRESS)) {
                tradePath[0] = router.WETH();
            }
            if (tradePath[tradeLen - 1] == address(BNB_TOKEN_ADDRESS)) {
                tradePath[tradeLen - 1] = router.WETH();
            }
        }

        uint256 srcAmountFee;
        uint256 srcAmountAfterFee;
        uint256 destBalanceBefore;
        address recipient;

        if (feeInSrc) {
            srcAmountFee = input.srcAmount.mul(input.platformFeeBps).div(BPS);
            srcAmountAfterFee = input.srcAmount.sub(srcAmountFee);
            recipient = input.recipient;
        } else {
            srcAmountAfterFee = input.srcAmount;
            destBalanceBefore = getBalance(actualDest, address(this));
            recipient = address(this);
        }

        uint256[] memory amounts;
        if (src == BNB_TOKEN_ADDRESS) {
            // swap eth -> token
            amounts = router.swapExactETHForTokens{value: srcAmountAfterFee}(
                input.minData,
                tradePath,
                recipient,
                MAX_AMOUNT
            );
        } else {
            if (actualDest == BNB_TOKEN_ADDRESS) {
                // swap token -> eth
                amounts = router.swapExactTokensForETH(
                    srcAmountAfterFee,
                    input.minData,
                    tradePath,
                    recipient,
                    MAX_AMOUNT
                );
            } else {
                // swap token -> token
                amounts = router.swapExactTokensForTokens(
                    srcAmountAfterFee,
                    input.minData,
                    tradePath,
                    recipient,
                    MAX_AMOUNT
                );
            }
        }

        if (!feeInSrc) {
            // fee in dest token, calculated received dest amount
            uint256 destBalanceAfter = getBalance(actualDest, address(this));
            destAmount = destBalanceAfter.sub(destBalanceBefore);
            uint256 destAmountFee = destAmount.mul(input.platformFeeBps).div(BPS);
            // charge fee in dest token
            addFeeToPlatform(input.platformWallet, actualDest, destAmountFee);
            // transfer back dest token to recipient
            destAmount = destAmount.sub(destAmountFee);
            transferToken(input.recipient, actualDest, destAmount);
        } else {
            // fee in src amount
            destAmount = amounts[amounts.length - 1];
            addFeeToPlatform(input.platformWallet, src, srcAmountFee);
        }
    }

    function validateAndPrepareSourceAmount(
        address protocol,
        IBEP20 src,
        uint256 srcAmount,
        address platformWallet
    ) internal virtual returns (uint256 actualSrcAmount) {
        require(supportedPlatformWallets[platformWallet], "unsupported platform wallet");
        if (src == BNB_TOKEN_ADDRESS) {
            require(msg.value == srcAmount, "wrong msg value");
            actualSrcAmount = srcAmount;
        } else {
            require(msg.value == 0, "bad msg value");
            uint256 balanceBefore = src.balanceOf(address(this));
            src.safeTransferFrom(msg.sender, address(this), srcAmount);
            uint256 balanceAfter = src.balanceOf(address(this));
            actualSrcAmount = balanceAfter.sub(balanceBefore);
            require(actualSrcAmount > 0, "invalid src amount");

            safeApproveAllowance(protocol, src);
        }
    }

    function safeForwardTokenAndCollectFee(
        IBEP20 token,
        address from,
        address payable to,
        uint256 amount,
        uint256 platformFeeBps,
        address payable platformWallet
    ) internal returns (uint256 destAmount) {
        require(platformFeeBps < BPS, "high platform fee");
        require(supportedPlatformWallets[platformWallet], "unsupported platform wallet");
        uint256 feeAmount = (amount * platformFeeBps) / BPS;
        destAmount = amount - feeAmount;
        if (token == BNB_TOKEN_ADDRESS) {
            require(msg.value >= amount);
            (bool success, ) = to.call{value: destAmount}("");
            require(success, "transfer eth failed");
        } else {
            uint256 balanceBefore = token.balanceOf(to);
            token.safeTransferFrom(from, to, amount);
            uint256 balanceAfter = token.balanceOf(to);
            destAmount = balanceAfter.sub(balanceBefore);
        }
        addFeeToPlatform(platformWallet, token, feeAmount);
    }

    function addFeeToPlatform(
        address wallet,
        IBEP20 token,
        uint256 amount
    ) internal {
        if (amount > 0) {
            platformWalletFees[wallet][token] = platformWalletFees[wallet][token].add(amount);
        }
    }

    function transferToken(
        address payable recipient,
        IBEP20 token,
        uint256 amount
    ) internal {
        if (amount == 0) return;
        if (token == BNB_TOKEN_ADDRESS) {
            (bool success, ) = recipient.call{value: amount}("");
            require(success, "failed to transfer eth");
        } else {
            token.safeTransfer(recipient, amount);
        }
    }

    function safeApproveAllowance(address spender, IBEP20 token) internal {
        if (token.allowance(address(this), spender) == 0) {
            getSetDecimals(token);
            token.safeApprove(spender, MAX_ALLOWANCE);
        }
    }
}
