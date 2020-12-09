pragma solidity 0.6.6;
pragma experimental ABIEncoderV2;

import "../wrappers/AAVE/ILendingPoolCore.sol";
import "../interfaces/IComptroller.sol";
import "./ISmartWalletLending.sol";
import "@kyber.network/utils-sc/contracts/Utils.sol";
import "@kyber.network/utils-sc/contracts/Withdrawable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract SmartWalletLending is ISmartWalletLending, Utils, Withdrawable, ReentrancyGuard {
    using SafeERC20 for IERC20Ext;
    using SafeMath for uint256;

    struct AaveLendingPoolData {
        IAaveLendingPoolV2 lendingPoolV2;
        mapping (IERC20Ext => address) aTokensV2;
        IWeth weth;
        IAaveLendingPoolV1 lendingPoolV1;
        mapping (IERC20Ext => address) aTokensV1;
        uint16 referalCode;
    }

    AaveLendingPoolData public aaveLendingPool;

    struct CompoundData {
        address comptroller;
        mapping(IERC20Ext => address) cTokens;
    }

    CompoundData public compoundData;

    address public swapImplementation;

    event UpdatedSwapImplementation(
        address indexed _oldSwapImpl,
        address indexed _newSwapImpl
    );
    event UpdatedAaveLendingPool(
        IAaveLendingPoolV2 poolV2,
        IAaveLendingPoolV1 poolV1,
        uint16 referalCode,
        IWeth weth,
        IERC20Ext[] tokens,
        address[] aTokensV1,
        address[] aTokensV2
    );
    event UpdatedCompoudData(
        address comptroller,
        address cEth,
        address[] cTokens,
        IERC20Ext[] underlyingTokens
    );

    modifier onlySwapImpl() {
        require(msg.sender == swapImplementation, "only swap impl");
        _;
    }

    constructor(address _admin) public Withdrawable(_admin) {}

    receive() external payable {}

    function updateSwapImplementation(address _swapImpl) external onlyAdmin {
        require(_swapImpl != address(0), "invalid swap impl");
        emit UpdatedSwapImplementation(swapImplementation, _swapImpl);
        swapImplementation = _swapImpl;
    }

    function updateAaveLendingPoolData(
        IAaveLendingPoolV2 poolV2,
        IAaveLendingPoolV1 poolV1,
        uint16 referalCode,
        IWeth weth,
        IERC20Ext[] calldata tokens
    )
        external override onlyAdmin
    {
        require(weth != IWeth(0), "invalid weth");
        aaveLendingPool.lendingPoolV2 = poolV2;
        aaveLendingPool.lendingPoolV1 = poolV1;
        aaveLendingPool.referalCode = referalCode;
        aaveLendingPool.weth = weth;

        address[] memory aTokensV1 = new address[](tokens.length);
        address[] memory aTokensV2 = new address[](tokens.length);

        for(uint256 i = 0; i < tokens.length; i++) {
            if (poolV1 != IAaveLendingPoolV1(0)) {
                // update data for pool v1
                try ILendingPoolCore(poolV1.core()).getReserveATokenAddress(address(tokens[i]))
                    returns (address aToken)
                {
                    aTokensV1[i] = aToken;
                } catch { }
                aaveLendingPool.aTokensV1[tokens[i]] = aTokensV1[i];
            }
            if (poolV2 != IAaveLendingPoolV2(0)) {
                address token = tokens[i] == ETH_TOKEN_ADDRESS ? address(weth) : address(tokens[i]);
                // update data for pool v2
                try poolV2.getReserveData(token)
                    returns (DataTypes.ReserveData memory data)
                {
                    aTokensV2[i] = data.aTokenAddress;
                } catch { }
                aaveLendingPool.aTokensV2[tokens[i]] = aTokensV2[i];
            }
        }

        emit UpdatedAaveLendingPool(poolV2, poolV1, referalCode, weth, tokens, aTokensV1, aTokensV2);
    }

    function updateCompoundData(
        address _comptroller,
        address _cEth,
        address[] calldata _cTokens
    ) external override onlyAdmin {
        require(_comptroller != address(0), "invalid _comptroller");
        require(_cEth != address(0), "invalid cEth");

        compoundData.comptroller = _comptroller;
        compoundData.cTokens[ETH_TOKEN_ADDRESS] = _cEth;

        IERC20Ext[] memory tokens;
        if (_cTokens.length > 0) {
            // add specific markets
            tokens = new IERC20Ext[](_cTokens.length);
            for(uint256 i = 0; i < _cTokens.length; i++) {
                require(_cTokens[i] != address(0), "invalid cToken");
                tokens[i] = IERC20Ext(ICompErc20(_cTokens[i]).underlying());
                require(tokens[i] != IERC20Ext(0), "invalid underlying token");
                compoundData.cTokens[tokens[i]] = _cTokens[i];
            }
            emit UpdatedCompoudData(_comptroller, _cEth, _cTokens, tokens);
        } else {
            // add all markets
            ICompErc20[] memory markets = IComptroller(_comptroller).getAllMarkets();
            tokens = new IERC20Ext[](markets.length);
            address[] memory cTokens = new address[](markets.length);
            for(uint256 i = 0; i < markets.length; i++) {
                if (address(markets[i]) == _cEth) {
                    tokens[i] = ETH_TOKEN_ADDRESS;
                    cTokens[i] = _cEth;
                    continue;
                }
                require(markets[i] != ICompErc20(0), "invalid cToken");
                tokens[i] = IERC20Ext(markets[i].underlying());
                require(tokens[i] != IERC20Ext(0), "invalid underlying token");
                cTokens[i] = address(markets[i]);
                compoundData.cTokens[tokens[i]] = cTokens[i];
            }
            emit UpdatedCompoudData(_comptroller, _cEth, cTokens, tokens);
        }
    }

    /// @dev deposit to lending platforms like AAVE, COMPOUND
    ///     expect amount of token should already be in the contract
    function depositTo(
        LendingPlatform platform,
        address payable onBehalfOf,
        IERC20Ext token,
        uint256 amount
    )
        external override onlySwapImpl
    {
        require(getBalance(token, address(this)) >= amount, "low balance");
        if (platform == LendingPlatform.AAVE_V1) {
            IAaveLendingPoolV1 poolV1 = aaveLendingPool.lendingPoolV1;
            IERC20Ext aToken = IERC20Ext(aaveLendingPool.aTokensV1[token]);
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
            // transfer all received aToken back to the sender
            aToken.safeTransfer(onBehalfOf, aTokenBalanceAfter.sub(aTokenBalanceBefore));
        } else if (platform == LendingPlatform.AAVE_V2) {
            if (token == ETH_TOKEN_ADDRESS) {
                // wrap eth -> weth, then deposit
                IWeth weth = aaveLendingPool.weth;
                IAaveLendingPoolV2 pool = aaveLendingPool.lendingPoolV2;
                weth.deposit{ value: amount }();
                safeApproveAllowance(address(pool), weth);
                pool.deposit(address(weth), amount, onBehalfOf, aaveLendingPool.referalCode);
            } else {
                IAaveLendingPoolV2 pool = aaveLendingPool.lendingPoolV2;
                safeApproveAllowance(address(pool), token);
                pool.deposit(address(token), amount, onBehalfOf, aaveLendingPool.referalCode);
            }
        } else {
            // Compound
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
            IERC20Ext(cToken).safeTransfer(onBehalfOf, cTokenBalanceAfter.sub(cTokenBalanceBefore));
        }
    }

    /// @dev withdraw from lending platforms like AAVE, COMPOUND
    ///     expect amount of aToken or cToken should already be in the contract
    function withdrawFrom(
        LendingPlatform platform,
        address payable onBehalfOf,
        IERC20Ext token,
        uint256 amount,
        uint256 minReturn
    )
        external override onlySwapImpl returns (uint256 returnedAmount)
    {
        address lendingToken = getLendingToken(platform, token);
        require(IERC20Ext(lendingToken).balanceOf(address(this)) >= amount, "bad lending token balance");

        uint256 tokenBalanceBefore;
        uint256 tokenBalanceAfter;
        if (platform == LendingPlatform.AAVE_V1) {
            // burn aToken to withdraw underlying token
            tokenBalanceBefore = getBalance(token, address(this));
            IAToken(lendingToken).redeem(amount);
            tokenBalanceAfter = getBalance(token, address(this));
            returnedAmount = tokenBalanceAfter.sub(tokenBalanceBefore);
            require(returnedAmount >= minReturn, "low returned amount");
            // transfer token to user
            transferToken(onBehalfOf, token, returnedAmount);
        } else if (platform == LendingPlatform.AAVE_V2) {
            if (token == ETH_TOKEN_ADDRESS) {
                // withdraw weth, then convert to eth for user
                address weth = address(aaveLendingPool.weth);
                // withdraw underlying token from pool
                tokenBalanceBefore = IERC20Ext(weth).balanceOf(address(this));
                returnedAmount = aaveLendingPool.lendingPoolV2.withdraw(weth, amount, address(this));
                tokenBalanceAfter = IERC20Ext(weth).balanceOf(address(this));
                require(tokenBalanceAfter.sub(tokenBalanceBefore) >= returnedAmount, "invalid return");
                require(returnedAmount >= minReturn, "low returned amount");
                // convert weth to eth and transfer to sender
                IWeth(weth).withdraw(returnedAmount);
                (bool success, ) = onBehalfOf.call { value: returnedAmount }("");
                require(success, "transfer eth to sender failed");
            } else {
                // withdraw token directly to user's wallet
                tokenBalanceBefore = getBalance(token, msg.sender);
                returnedAmount = aaveLendingPool.lendingPoolV2.withdraw(address(token), amount, msg.sender);
                tokenBalanceAfter = getBalance(token, msg.sender);
                // valid received amount in msg.sender
                require(tokenBalanceAfter.sub(tokenBalanceBefore) >= returnedAmount, "invalid return");
                require(returnedAmount >= minReturn, "low returned amount");
                token.safeTransfer(onBehalfOf, returnedAmount);
            }
        } else {
            // COMPOUND
            // burn cToken to withdraw underlying token
            tokenBalanceBefore = getBalance(token, address(this));
            require(ICompErc20(lendingToken).redeem(amount) == 0, "unable to redeem");
            tokenBalanceAfter = getBalance(token, address(this));
            returnedAmount = tokenBalanceAfter.sub(tokenBalanceBefore);
            require(returnedAmount >= minReturn, "low returned amount");
            // transfer underlying token to user
            transferToken(onBehalfOf, token, returnedAmount);
        }
    }

    /// @dev repay borrows to lending platforms like AAVE, COMPOUND
    ///     expect amount of token should already be in the contract
    ///     if amount > payAmount, (amount - payAmount) will be sent back to user
    function repayBorrowTo(
        LendingPlatform platform,
        address payable onBehalfOf,
        IERC20Ext token,
        uint256 amount,
        uint256 payAmount,
        uint256 rateMode // only for aave v2
    ) external override onlySwapImpl {
        require(amount >= payAmount, "invalid pay amount");
        require(getBalance(token, address(this)) >= amount, "bad token balance");
        if (amount > payAmount) {
            // transfer back token
            transferToken(payable(onBehalfOf), token, amount - payAmount);
        }
        if (platform == LendingPlatform.AAVE_V1) {
            IAaveLendingPoolV1 poolV1 = aaveLendingPool.lendingPoolV1;
            // approve if needed
            if (token != ETH_TOKEN_ADDRESS) {
                safeApproveAllowance(address(poolV1), token);
            }
            poolV1.repay{ value: token == ETH_TOKEN_ADDRESS ? amount : 0 }(
                address(token), amount, onBehalfOf
            );
        } else if (platform == LendingPlatform.AAVE_V2) {
            IAaveLendingPoolV2 poolV2 = aaveLendingPool.lendingPoolV2;
            if (token == ETH_TOKEN_ADDRESS) {
                IWeth weth = aaveLendingPool.weth;
                weth.deposit{ value: amount }();
                safeApproveAllowance(address(poolV2), weth);
                poolV2.repay(address(weth), amount, rateMode, onBehalfOf);
            } else {
                safeApproveAllowance(address(poolV2), token);
                poolV2.repay(address(token), amount, rateMode, onBehalfOf);
            }
        } else {
            // compound
            address cToken = compoundData.cTokens[token];
            require(cToken != address(0), "token is not supported by Compound");
            if (token == ETH_TOKEN_ADDRESS) {
                ICompEth(cToken).repayBorrowBehalf{ value: amount }(onBehalfOf);
            } else {
                safeApproveAllowance(cToken, token);
                ICompErc20(cToken).repayBorrowBehalf(onBehalfOf, amount);
            }
        }
    }

    function claimComp(
        address[] calldata holders,
        ICompErc20[] calldata cTokens,
        bool borrowers,
        bool suppliers
    )
        external override onlySwapImpl
    {
        require(holders.length > 0, "no holders");
        IComptroller comptroller = IComptroller(compoundData.comptroller);
        if (cTokens.length == 0) {
            // claim for all markets
            ICompErc20[] memory markets = comptroller.getAllMarkets();
            comptroller.claimComp(holders, markets, borrowers, suppliers);
        } else {
            comptroller.claimComp(holders, cTokens, borrowers, suppliers);
        }
        emit ClaimedComp(holders, cTokens, borrowers, suppliers);
    }

    function getLendingToken(LendingPlatform platform, IERC20Ext token)
        public override view returns(address)
    {
        if (platform == LendingPlatform.AAVE_V1) {
            return aaveLendingPool.aTokensV1[token];
        } else if (platform == LendingPlatform.AAVE_V2) {
            return aaveLendingPool.aTokensV2[token];
        }
        return compoundData.cTokens[token];
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
