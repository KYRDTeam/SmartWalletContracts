pragma solidity 0.6.6;


interface IBurnGasHelper {
    function getAmountGasTokensToBurn(
        uint gasConsumption,
        bytes calldata data
    ) external view returns(uint numGas, address gasToken);
}
