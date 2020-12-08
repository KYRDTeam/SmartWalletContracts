pragma solidity 0.6.6;

import "../wrappers/AAVE/ILendingPoolCore.sol";
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
        IWeth weth;
        IAaveLendingPoolV1 lendingPoolV1;
        uint16 referalCode;
    }

    AaveLendingPoolData public aaveLendingPool;

    struct CompoundData {
        address compToken;
        mapping(IERC20Ext => address) cTokens;
    }

    CompoundData public compoundData;

    address public immutable swapImplementation;

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

    modifier onlySwapImpl() {
        require(msg.sender == swapImplementation, "only swap impl");
        _;
    }

    constructor(address _admin, address _swapImpl) public Withdrawable(_admin) {
        swapImplementation = _swapImpl;
    }

    receive() external payable {}

    function updateAaveLendingPoolData(
        IAaveLendingPoolV2 poolV2,
        IAaveLendingPoolV1 poolV1,
        uint16 referalCode,
        IWeth weth
    )
        external override onlyAdmin
    {
        require(weth != IWeth(0), "invalid weth");
        aaveLendingPool = AaveLendingPoolData({
            lendingPoolV2: poolV2,
            lendingPoolV1: poolV1,
            referalCode: referalCode,
            weth: weth
        });
        emit UpdatedAaveLendingPool(poolV2, poolV1, referalCode, weth);
    }

    function updateCompoundData(
        address _compToken,
        address _cEth,
        address[] calldata _cTokens
    ) external override onlyAdmin {
        require(_compToken != address(0), "invalid comp token");
        require(_cEth != address(0), "invalid cEth");
        compoundData.compToken = _compToken;
        compoundData.cTokens[ETH_TOKEN_ADDRESS] = _cEth;
        IERC20Ext[] memory tokens = new IERC20Ext[](_cTokens.length);
        for(uint256 i = 0; i < _cTokens.length; i++) {
            require(_cTokens[i] != address(0), "invalid cToken");
            tokens[i] = IERC20Ext(ICompErc20(_cTokens[i]).underlying());
            require(tokens[i] != IERC20Ext(0), "invalid underlying token");
            compoundData.cTokens[tokens[i]] = _cTokens[i];
        }
        emit UpdatedCompoudData(_compToken, _cEth, _cTokens, tokens);
    }

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
            IERC20Ext(cToken).safeTransfer(onBehalfOf, cTokenBalanceAfter.sub(cTokenBalanceBefore));
        }
    }

    function withdrawFrom(
        LendingPlatform platform,
        address payable onBehalfOf,
        IERC20Ext token,
        uint256 amount
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
            // transfer token to user
            transferToken(onBehalfOf, token, returnedAmount);
        } else if (platform == LendingPlatform.AAVE_V2) {
            // TODO: Find a way to get correct aToken address
            // IAaveLendingPoolV2 poolV2 = aaveLendingPool.lendingPoolV2;
            // if (token == ETH_TOKEN_ADDRESS) {
            //     // withdraw weth, then convert to eth for user
            //     address weth = address(aaveLendingPool.weth);
            //     // collect aToken to burn
            //     address aToken = poolV2.getReserveData(weth).aTokenAddress;
            //     IERC20Ext(aToken).safeTransferFrom(msg.sender, address(this), amount);

            //     // withdraw underlying token from pool
            //     tokenBalanceBefore = IERC20Ext(weth).balanceOf(address(this));
            //     returnedAmount = aaveLendingPool.lendingPoolV2.withdraw(weth, amount, address(this));
            //     tokenBalanceAfter = IERC20Ext(weth).balanceOf(address(this));
            //     require(tokenBalanceAfter.sub(tokenBalanceBefore) >= returnedAmount, "invalid return");

            //     // convert weth to eth and transfer to sender
            //     IWeth(weth).withdraw(returnedAmount);
            //     (bool success, ) = msg.sender.call { value: returnedAmount }("");
            //     require(success, "transfer eth to sender failed");
            // } else {
            //     // collect aToken
            //     address aToken = poolV2.getReserveData(address(token)).aTokenAddress;
            //     IERC20Ext(aToken).safeTransferFrom(msg.sender, address(this), amount);
            //     // withdraw token directly to user's wallet
            //     tokenBalanceBefore = getBalance(token, msg.sender);
            //     returnedAmount = aaveLendingPool.lendingPoolV2.withdraw(address(token), amount, msg.sender);
            //     tokenBalanceAfter = getBalance(token, msg.sender);
            //     // valid received amount in msg.sender
            //     require(tokenBalanceAfter.sub(tokenBalanceBefore) >= returnedAmount, "invalid return");
            // }
        } else {
            // COMPOUND
            // burn cToken to withdraw underlying token
            tokenBalanceBefore = getBalance(token, address(this));
            returnedAmount = ICompErc20(lendingToken).redeem(amount);
            tokenBalanceAfter = getBalance(token, address(this));
            require(tokenBalanceAfter.sub(tokenBalanceBefore) >= returnedAmount, "invalid return");
            // transfer underlying token to user
            transferToken(onBehalfOf, token, returnedAmount);
        }
    }

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

    function getLendingToken(LendingPlatform platform, IERC20Ext token)
        public override view returns(address)
    {
        if (platform == LendingPlatform.AAVE_V1) {
            IAaveLendingPoolV1 poolV1 = aaveLendingPool.lendingPoolV1;
            return ILendingPoolCore(poolV1.core()).getReserveATokenAddress(address(token));
        } else if (platform == LendingPlatform.AAVE_V2) {
            // TODO
            return address(token);
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
