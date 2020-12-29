pragma solidity 0.6.6;

import "./SmartWalletSwapStorage.sol";


contract SmartWalletSwapProxy is SmartWalletSwapStorage {

    event ImplementationUpdated(address indexed implementation);

    constructor(
        address _admin,
        address _implementation,
        IKyberProxy _proxy,
        IUniswapV2Router02[] memory _routers
    ) public SmartWalletSwapStorage(_admin) {
        implementation = _implementation;
        kyberProxy = _proxy;
        for(uint256 i = 0; i < _routers.length; i++) {
            isRouterSupported[_routers[i]] = true;
        }
    }

    function updateNewImplementation(address _implementation) external onlyAdmin {
        implementation = _implementation;
        emit ImplementationUpdated(_implementation);
    }

    receive() external payable {}

    /**
     * @dev Delegates execution to an implementation contract.
     * It returns to the external caller whatever the implementation returns
     * or forwards reverts.
     */
    fallback() external payable {
        (bool success, ) = implementation.delegatecall(msg.data);
        
        assembly {
            let free_mem_ptr := mload(0x40)
            returndatacopy(free_mem_ptr, 0, returndatasize())
            switch success
            case 0 { revert(free_mem_ptr, returndatasize()) }
            default { return(free_mem_ptr, returndatasize()) }
        }
    }
}
