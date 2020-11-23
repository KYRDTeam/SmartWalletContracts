pragma solidity 0.6.6;


interface IBurnGasHelper {
    function getAmountGasTokensToBurn(
        address trader,
        address protocol,
        uint256 srcAmount,
        address[] calldata tradePath,
        address recipient,
        uint256 platformFee,
        address platformWallet,
        bytes calldata hint,
        uint256 gasConsumption
    ) external view returns(uint numGas, address gasToken);
}
