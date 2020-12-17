pragma solidity 0.6.6;

import "../exchange/SmartWalletSwapImplementation.sol";


/// Version 2 of implementation to test upgrade
contract SmartWalletSwapImplementation2 is SmartWalletSwapImplementation {

    mapping(address => bool) internal isUserBlocked;

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
        require(!isUserBlocked[msg.sender]);
        actualSrcAmount = super.validateAndPrepareSourceAmount(
            protocol, src, srcAmount, platformWallet
        );
    }
}
