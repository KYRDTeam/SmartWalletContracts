pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "../interfaces/IComptroller.sol";
import "./ISmartWalletLending.sol";
import "@kyber.network/utils-sc/contracts/Utils.sol";
import "@kyber.network/utils-sc/contracts/Withdrawable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";


contract SmartWalletLending is ISmartWalletLending, Utils, Withdrawable {
    using SafeERC20 for IBEP20;
    using SafeMath for uint256;

    struct VenusData {
        address comptroller;
        mapping(IBEP20 => address) vTokens;
    }

    VenusData public venusData;

    address public swapImplementation;

    event UpdatedSwapImplementation(address indexed _oldSwapImpl, address indexed _newSwapImpl);
    event UpdatedVenusData(
        address comptroller,
        address vBnb,
        address[] vTokens,
        IBEP20[] underlyingTokens
    );

    modifier onlySwapImpl() {
        require(msg.sender == swapImplementation, "only swap impl");
        _;
    }

    constructor(address _admin) Withdrawable(_admin) {}

    receive() external payable {}

    function updateSwapImplementation(address _swapImpl) external onlyAdmin {
        require(_swapImpl != address(0), "invalid swap impl");
        emit UpdatedSwapImplementation(swapImplementation, _swapImpl);
        swapImplementation = _swapImpl;
    }

    function updateVenusData(
        address _comptroller,
        address _vBnb,
        address[] calldata _vTokens
    ) external override onlyAdmin {
        require(_comptroller != address(0), "invalid _comptroller");
        require(_vBnb != address(0), "invalid vBnb");

        venusData.comptroller = _comptroller;
        venusData.vTokens[BNB_TOKEN_ADDRESS] = _vBnb;

        IBEP20[] memory tokens;
        if (_vTokens.length > 0) {
            // add specific markets
            tokens = new IBEP20[](_vTokens.length);
            for (uint256 i = 0; i < _vTokens.length; i++) {
                require(_vTokens[i] != address(0), "invalid vToken");
                tokens[i] = IBEP20(IVBep20(_vTokens[i]).underlying());
                require(tokens[i] != IBEP20(0), "invalid underlying token");
                venusData.vTokens[tokens[i]] = _vTokens[i];

                // do token approvals
                safeApproveAllowance(_vTokens[i], tokens[i]);
            }
            emit UpdatedVenusData(_comptroller, _vBnb, _vTokens, tokens);
        } else {
            // add all markets
            IVBep20[] memory markets = IComptroller(_comptroller).getAllMarkets();
            tokens = new IBEP20[](markets.length);
            address[] memory vTokens = new address[](markets.length);
            for (uint256 i = 0; i < markets.length; i++) {
                if (address(markets[i]) == _vBnb) {
                    tokens[i] = BNB_TOKEN_ADDRESS;
                    vTokens[i] = _vBnb;
                    continue;
                }
                require(markets[i] != IVBep20(0), "invalid vToken");
                tokens[i] = IBEP20(markets[i].underlying());
                require(tokens[i] != IBEP20(0), "invalid underlying token");
                vTokens[i] = address(markets[i]);
                venusData.vTokens[tokens[i]] = vTokens[i];

                // do token approvals
                safeApproveAllowance(_vTokens[i], tokens[i]);
            }
            emit UpdatedVenusData(_comptroller, _vBnb, vTokens, tokens);
        }
    }

    /// @dev deposit to lending platforms like VENUS
    ///     expect amount of token should already be in the contract
    function depositTo(
        LendingPlatform platform,
        address payable onBehalfOf,
        IBEP20 token,
        uint256 amount
    ) external override onlySwapImpl {
        require(getBalance(token, address(this)) >= amount, "low balance");
        if (platform == LendingPlatform.VENUS) {
            // Venus
            address vToken = venusData.vTokens[token];
            require(vToken != address(0), "token is not supported by Venus");
            uint256 vTokenBalanceBefore = IBEP20(vToken).balanceOf(address(this));
            if (token == BNB_TOKEN_ADDRESS) {
                IVBnb(vToken).mint{value: amount}();
            } else {
                require(IVBep20(vToken).mint(amount) == 0, "can not mint vToken");
            }
            uint256 vTokenBalanceAfter = IBEP20(vToken).balanceOf(address(this));
            IBEP20(vToken).safeTransfer(
                onBehalfOf,
                vTokenBalanceAfter.sub(vTokenBalanceBefore)
            );
        }
    }

    /// @dev withdraw from lending platforms like VENUS
    ///     expect amount of aToken or vToken should already be in the contract
    function withdrawFrom(
        LendingPlatform platform,
        address payable onBehalfOf,
        IBEP20 token,
        uint256 amount,
        uint256 minReturn
    ) external override onlySwapImpl returns (uint256 returnedAmount) {
        address lendingToken = getLendingToken(platform, token);

        uint256 tokenBalanceBefore;
        uint256 tokenBalanceAfter;
        if (platform == LendingPlatform.VENUS) {
            // VENUS
            // burn vToken to withdraw underlying token
            tokenBalanceBefore = getBalance(token, address(this));
            require(IVBep20(lendingToken).redeem(amount) == 0, "unable to redeem");
            tokenBalanceAfter = getBalance(token, address(this));
            returnedAmount = tokenBalanceAfter.sub(tokenBalanceBefore);
            require(returnedAmount >= minReturn, "low returned amount");
            // transfer underlying token to user
            transferToken(onBehalfOf, token, returnedAmount);
        }
    }

    /// @dev repay borrows to lending platforms like VENUS
    ///     expect amount of token should already be in the contract
    ///     if amount > payAmount, (amount - payAmount) will be sent back to user
    function repayBorrowTo(
        LendingPlatform platform,
        address payable onBehalfOf,
        IBEP20 token,
        uint256 amount,
        uint256 payAmount
    ) external override onlySwapImpl {
        require(amount >= payAmount, "invalid pay amount");
        require(getBalance(token, address(this)) >= amount, "bad token balance");

        if (amount > payAmount) {
            // transfer back token
            transferToken(payable(onBehalfOf), token, amount - payAmount);
        }
        if (platform == LendingPlatform.VENUS) {
            // venus
            address vToken = venusData.vTokens[token];
            require(vToken != address(0), "token is not supported by Venus");
            if (token == BNB_TOKEN_ADDRESS) {
                IVBnb(vToken).repayBorrowBehalf{value: payAmount}(onBehalfOf);
            } else {
                require(
                    IVBep20(vToken).repayBorrowBehalf(onBehalfOf, payAmount) == 0,
                    "venus repay error"
                );
            }
        }
    }

    function getLendingToken(LendingPlatform platform, IBEP20 token)
        public
        view
        override
        returns (address)
    {
        return venusData.vTokens[token];
    }

    /** @dev Calculate the current user debt and return
    */
    function storeAndRetrieveUserDebtCurrent(
        LendingPlatform platform,
        address _reserve,
        address _user
    ) external override returns (uint256 debt) {
        IVBep20 vToken = IVBep20(venusData.vTokens[IBEP20(_reserve)]);
        debt = vToken.borrowBalanceCurrent(_user);
    }

    /** @dev Return the stored user debt from given platform
    *   to get the latest data of user's debt for repaying, should call
    *   storeAndRetrieveUserDebtCurrent function, esp for Venus platform
    */
    function getUserDebtStored(
        LendingPlatform platform,
        address _reserve,
        address _user
    ) public view override returns (uint256 debt) {
        if (platform == LendingPlatform.VENUS) {
            IVBep20 vToken = IVBep20(venusData.vTokens[IBEP20(_reserve)]);
            debt = vToken.borrowBalanceStored(_user);
        }
    }

    function safeApproveAllowance(address spender, IBEP20 token) internal {
        if (token != BNB_TOKEN_ADDRESS && token.allowance(address(this), spender) == 0) {
            token.safeApprove(spender, MAX_ALLOWANCE);
        }
    }

    function transferToken(
        address payable recipient,
        IBEP20 token,
        uint256 amount
    ) internal {
        if (token == BNB_TOKEN_ADDRESS) {
            (bool success, ) = recipient.call{value: amount}("");
            require(success, "failed to transfer eth");
        } else {
            token.safeTransfer(recipient, amount);
        }
    }
}
