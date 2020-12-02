pragma solidity 0.6.6;

import "../SmartWalletSwapImplementation.sol";


/// Version 2 of implementation to test upgrade
contract SmartWalletSwapImplementation2 is SmartWalletSwapImplementation {

    using SafeERC20 for IERC20Ext;
    using SafeMath for uint256;

    mapping(address => bool) public isUserBlocked;

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

    event SupportedPlatformWalletsUpdated(address[] indexed wallets, bool indexed isSupported);
    event UpdateKyberProxy(IKyberProxy indexed newProxy);
    event UpdateUniswapRouters(IUniswapV2Router02[] indexed uniswapRouters, bool isAdded);
    event ApproveAllowances(IERC20Ext[] indexed tokens, address[] indexed spenders, bool isReset);

    constructor(
        address _admin, IKyberProxy _kyberProxy,
        IUniswapV2Router02[] memory _uniswapRouters,
        IBurnGasHelper _burnGasHelper
    )
        public SmartWalletSwapImplementation(_admin, _kyberProxy, _uniswapRouters, _burnGasHelper) {}

    function updateUserBlocked(address[] calldata users, bool isBlocked) external onlyAdmin {
        for(uint256 i = 0; i < users.length; i++) {
            isUserBlocked[users[i]] = isBlocked;
        }
    }

    function validateAndPrepareSourceAmount(
        address protocol,
        IERC20Ext src,
        uint256 srcAmount,
        address platformWallet
    ) internal override returns(uint256 actualSrcAmount) {
        require(!isUserBlocked[msg.sender], "user is blocked");
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

            // check if need to approve allowance to protocol
            // only allow when it is zero
            if (src.allowance(address(this), protocol) == 0) {
                src.safeApprove(protocol, MAX_ALLOWANCE);
            }
        }
    }
}
