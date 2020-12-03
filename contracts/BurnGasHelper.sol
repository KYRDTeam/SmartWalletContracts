pragma solidity 0.6.6;

import "./IBurnGasHelper.sol";
import "@kyber.network/utils-sc/contracts/Utils.sol";
import "@kyber.network/utils-sc/contracts/Withdrawable.sol";


contract BurnGasHelper is IBurnGasHelper, Utils, Withdrawable {

    // Total gas consumption for the tx:
    // tx_gas + baseGasConsumption + x * burntGasConsumption where x is number of gas tokens that are burnt
    // gas refunded: refundedGasPerToken * x
    // refundedGasPerToken * x <= 1/2 * (tx_gas + baseGasConsumption + x * burntGasConsumption)
    // example using GST2: https://gastoken.io/
    // baseGasConsumption: 14,154
    // burntGasConsumption: 6,870
    // refundedGasPerToken: 24,000
    struct GasTokenConfiguration {
        address gasToken;
        uint64 baseGasConsumption;
        uint64 burntGasConsumption;
        uint64 refundedGasPerToken;
    }

    GasTokenConfiguration public gasTokenConfig;

    event GasTokenConfigDataSet(
        address indexed gasToken,
        uint64 baseGasConsumption,
        uint64 burntGasConsumption,
        uint64 refundedGasPerToken
    );

    constructor(
        address _admin,
        address _gasToken,
        uint64 _baseGasConsumption,
        uint64 _burntGasConsumption,
        uint64 _refundedGasPerToken
    ) public Withdrawable(_admin) {
        require(2 * _refundedGasPerToken > _burntGasConsumption, "invalid params");
        gasTokenConfig = GasTokenConfiguration({
            gasToken: _gasToken,
            baseGasConsumption: _baseGasConsumption,
            burntGasConsumption: _burntGasConsumption,
            refundedGasPerToken: _refundedGasPerToken
        });
    }

    function setGasTokenConfigData(
        address _gasToken,
        uint64 _baseGasConsumption,
        uint64 _burntGasConsumption,
        uint64 _refundedGasPerToken
    ) external onlyAdmin {
        require(2 * _refundedGasPerToken > _burntGasConsumption, "invalid params");
        gasTokenConfig = GasTokenConfiguration({
            gasToken: _gasToken,
            baseGasConsumption: _baseGasConsumption,
            burntGasConsumption: _burntGasConsumption,
            refundedGasPerToken: _refundedGasPerToken
        });
        emit GasTokenConfigDataSet(_gasToken, _baseGasConsumption, _burntGasConsumption, _refundedGasPerToken);
    }

    function getAmountGasTokensToBurn(
        uint gasConsumption,
        bytes calldata // data
    ) external override view returns(uint numGas, address gasToken) {

        uint256 gas = gasleft();
        uint256 safeNumTokens = 0;
        if (gas >= 27710) {
            safeNumTokens = (gas - 27710) / 7020; //(1148 + 5722 + 150);
        }

        GasTokenConfiguration memory config = gasTokenConfig;
        gasToken = config.gasToken;
        // note: 2 * _refundedGasPerToken > burntGasConsumption
        numGas = (gasConsumption + uint(config.baseGasConsumption))
            / uint(2 * config.refundedGasPerToken - config.burntGasConsumption); 

        numGas = minOf(safeNumTokens, numGas);
    }
}
