pragma solidity 0.7.6;

import "./IVBep20.sol";


interface IComptroller {
    function getAllMarkets() external view returns (IVBep20[] memory);
    function enterMarkets(address[] calldata vTokens) external returns (uint[] memory);
}
