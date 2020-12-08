pragma solidity 0.6.6;

import "./ISmartWalletSwapImplementation.sol";
import "./SmartWalletSwapStorage.sol";
import "../wrappers/AAVE/ILendingPoolCore.sol";
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
    event UpdatedAaveLendingPool(
        IAaveLendingPoolV2 poolV2,
        IAaveLendingPoolV1 poolV1,
        uint16 referalCode,
        IWeth weth
    );
    event UpdatedCompoudData(
        address compToken,
        address cEth,
        address[] cTokens,
        IERC20Ext[] underlyingTokens
    );
    event ApproveAllowances(
        IERC20Ext[] indexed tokens,
        address[] indexed spenders,
        bool isReset
    );

    constructor(address _admin) public SmartWalletSwapStorage(_admin) {}

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

    function updateAaveLendingPoolData(
        IAaveLendingPoolV2 poolV2,
        IAaveLendingPoolV1 poolV1,
        uint16 referalCode,
        IWeth weth
    ) external onlyAdmin {
        require(weth != IWeth(0), "invalid weth");
        aaveLendingPool = AaveLendingPoolData({
            lendingPoolV2: poolV2,
            lendingPoolV1: poolV1,
            referalCode: referalCode,
            weth: weth
        });
        emit UpdatedAaveLendingPool(poolV2, poolV1, referalCode, weth);
    }

    function updateCompoundData(address _comToken, address _cEth, address[] calldata _cTokens)
        external onlyAdmin
    {
        require(_comToken != address(0), "invalid comp token");
        require(_cEth != address(0), "invalid cEth");
        compoundData.compToken = _comToken;
        compoundData.cTokens[ETH_TOKEN_ADDRESS] = _cEth;
        IERC20Ext[] memory tokens = new IERC20Ext[](_cTokens.length);
        for(uint256 i = 0; i < _cTokens.length; i++) {
            require(_cTokens[i] != address(0), "invalid cToken");
            tokens[i] = IERC20Ext(ICompErc20(_cTokens[i]).underlying());
            require(tokens[i] != IERC20Ext(0), "invalid underlying token");
            compoundData.cTokens[tokens[i]] = _cTokens[i];
        }
        emit UpdatedCompoudData(_comToken, _cEth, _cTokens, tokens);
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

    function swapKyberAndDeposit(
        DepositType depositType,
        IERC20Ext src,
        IERC20Ext dest,
        uint256 srcAmount,
        uint256 minConversionRate,
        uint256 platformFeeBps,
        address payable platformWallet,
        bytes calldata hint,
        bool useGasToken
    )
        external override payable returns (uint256 destAmount)
    {
        uint256 gasBefore = useGasToken ? gasleft() : 0;
        if (src == dest) {
            // just collect src token, no need to swap
            destAmount = validateAndPrepareSourceAmount(
                address(kyberProxy),
                src,
                srcAmount,
                platformWallet
            );
        } else {
            destAmount = doKyberTrade(
                src,
                dest,
                srcAmount,
                minConversionRate,
                payable(address(this)),
                platformFeeBps,
                platformWallet,
                hint
            );
        }

        depositAndBurnGas(depositType, dest, destAmount, useGasToken, gasBefore);
        // TODO: Emit event
    }

    function swapUniswapAndDeposit(
        DepositType depositType,
        IUniswapV2Router02 router,
        uint256 srcAmount,
        uint256 minDestAmount,
        address[] calldata tradePath,
        uint256 platformFeeBps,
        address payable platformWallet,
        bool useGasToken
    )
        external override payable returns (uint256 destAmount)
    {
        uint256 gasBefore = useGasToken ? gasleft() : 0;
        IERC20Ext dest = IERC20Ext(tradePath[tradePath.length - 1]);
        if (tradePath.length == 1) {
            // just collect src token, no need to swap
            destAmount = validateAndPrepareSourceAmount(
                address(router),
                dest,
                srcAmount,
                platformWallet
            );
        } else {
            destAmount = swapUniswap(
                router, srcAmount, minDestAmount, tradePath, payable(address(this)), platformFeeBps, platformWallet, false
            );
        }

        depositAndBurnGas(depositType, dest, destAmount, useGasToken, gasBefore);
        // TODO: Emit event
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

    /// @dev swap token via a supported Uniswap router
    /// @notice for some tokens that are paying fee, for example: DGX
    /// contract will trade with received src token amount (after minus fee)
    /// for Uniswap, fee will be taken in src token
    function swapUniswap(
        IUniswapV2Router02 router,
        uint256 srcAmount,
        uint256 minDestAmount,
        address[] memory tradePath,
        address payable recipient,
        uint256 platformFeeBps,
        address payable platformWallet,
        bool useGasToken
    ) public override nonReentrant payable returns (uint256 destAmount) {
        uint256 gasBefore = useGasToken ? gasleft() : 0;
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
        uint256 numberGasBurns = 0;
        if (useGasToken) {
            numberGasBurns = burnGasTokensAfterTrade(gasBefore);
        }

        emit UniswapTrade(
            msg.sender,
            address(router),
            tradePath,
            input.srcAmount,
            destAmount,
            input.recipient,
            input.platformFeeBps,
            input.platformWallet,
            useGasToken,
            numberGasBurns
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
            require(balanceAfter >= balanceBefore, "invalid balance");
            // prevent case of token with fee
            actualSrcAmount = balanceAfter - balanceBefore;

            safeApproveAllowance(protocol, src);
        }
    }

    function depositAndBurnGas(
        DepositType depositType,
        IERC20Ext token,
        uint256 amount,
        bool useGasToken,
        uint256 gasBefore
    )
        internal returns (uint256 numberGasBurns)
    {
        if (depositType == DepositType.AAVE_V1) {
            IAaveLendingPoolV1 poolV1 = aaveLendingPool.lendingPoolV1;
            IERC20Ext aToken = IERC20Ext(ILendingPoolCore(poolV1.core()).getReserveATokenAddress(address(token)));
            require(aToken != IERC20Ext(0), "aToken not found");
            // approve allowance if needed
            if (token != ETH_TOKEN_ADDRESS) {
                safeApproveAllowance(address(poolV1), token);
            }
            // deposit and compute received aToken amount
            uint256 aTokenBalanceBefore = aToken.balanceOf(address(this));
            poolV1.deposit{ value: token == ETH_TOKEN_ADDRESS ? amount : 0 }(
                address(token), amount, aaveLendingPool.referalCode
            );
            uint256 aTokenBalanceAfter = aToken.balanceOf(address(this));
            require(aTokenBalanceAfter >= aTokenBalanceBefore, "aToken is not transferred back");
            // transfer all received aToken back to the sender
            aToken.safeTransfer(msg.sender, aTokenBalanceAfter - aTokenBalanceBefore);
        } else if (depositType == DepositType.AAVE_V2) {
            if (token == ETH_TOKEN_ADDRESS) {
                // wrap eth -> weth, then deposit
                IWeth weth = aaveLendingPool.weth;
                IAaveLendingPoolV2 pool = aaveLendingPool.lendingPoolV2;
                weth.deposit{ value: amount }();
                safeApproveAllowance(address(pool), weth);
                pool.deposit(address(weth), amount, msg.sender, aaveLendingPool.referalCode);
            } else {
                IAaveLendingPoolV2 pool = aaveLendingPool.lendingPoolV2;
                safeApproveAllowance(address(pool), token);
                pool.deposit(address(token), amount, msg.sender, aaveLendingPool.referalCode);
            }
        } else {
            // COMPOUND
            address cToken = compoundData.cTokens[token];
            require(cToken != address(0), "token is not supported by Compound");
            uint256 cTokenBalanceBefore = IERC20Ext(cToken).balanceOf(address(this));
            if (token == ETH_TOKEN_ADDRESS) {
                ICompEth(cToken).mint { value: amount }();
            } else {
                safeApproveAllowance(cToken, token);
                require(ICompErc20(cToken).mint(amount) == 0, "can not mint cToken");
            }
            uint256 cTokenBalanceAfter = IERC20Ext(cToken).balanceOf(address(this));
            require(cTokenBalanceAfter >= cTokenBalanceBefore, "invalid balance after");
            IERC20Ext(cToken).safeTransfer(msg.sender, cTokenBalanceAfter - cTokenBalanceBefore);
        }
        if (useGasToken) {
            numberGasBurns = burnGasTokensAfterTrade(gasBefore);
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

    function safeApproveAllowance(address spender, IERC20Ext token) internal {
        if (token.allowance(address(this), spender) == 0) {
            token.safeApprove(spender, MAX_ALLOWANCE);
        }
    }
}
