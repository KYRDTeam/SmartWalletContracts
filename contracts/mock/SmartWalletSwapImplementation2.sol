pragma solidity 0.6.6;

import "../exchange/SmartWalletSwapImplementation.sol";


/// Version 2 of implementation to test upgrade
contract SmartWalletSwapImplementation2 is SmartWalletSwapImplementation {

    mapping(address => bool) public isUserBlocked;

    constructor(address _admin) public SmartWalletSwapImplementation(_admin) {}

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
