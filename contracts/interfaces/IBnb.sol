pragma solidity 0.7.6;

import "@kyber.network/utils-sc/contracts/IBEP20.sol";


interface IBnb is IBEP20 {
    function deposit() external payable;
    function withdraw(uint256 wad) external;
}
