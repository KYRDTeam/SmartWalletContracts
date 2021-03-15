pragma solidity 0.7.6;

import "@kyber.network/utils-sc/contracts/IBEP20.sol";


interface IKyberProxy {

    function trade(
        IBEP20 src,
        uint256 srcAmount,
        IBEP20 destToken,
        address payable destAddress,
        uint256 conversionRate
    ) external payable returns (uint256 destAmount);

    function getConversionRate(
        IBEP20 src,
        IBEP20 dest,
        uint256 srcQty,
        uint256 blockNumber
    ) external view returns (uint256);
}
