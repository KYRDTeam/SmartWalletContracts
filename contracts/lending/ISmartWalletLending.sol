pragma solidity 0.6.6;

import "@kyber.network/utils-sc/contracts/IERC20Ext.sol";
import "../interfaces/IAaveLendingPoolV2.sol";
import "../interfaces/IAaveLendingPoolV1.sol";
import "../interfaces/IWeth.sol";
import "../interfaces/ICompErc20.sol";


interface ISmartWalletLending {

    event ClaimedComp(
        address[] holders,
        ICompErc20[] cTokens,
        bool borrowers,
        bool suppliers
    );

    enum LendingPlatform { AAVE_V1, AAVE_V2, COMPOUND }

    function updateAaveLendingPoolData(
        IAaveLendingPoolV2 poolV2,
        IAaveLendingPoolV1 poolV1,
        uint16 referalCode,
        IWeth weth,
        IERC20Ext[] calldata tokens
    ) external;

    function updateCompoundData(
        address _comToken,
        address _cEth,
        address[] calldata _cTokens
    ) external;

    function depositTo(
        LendingPlatform platform,
        address payable onBehalfOf,
        IERC20Ext token,
        uint256 amount
    ) external;

    function withdrawFrom(
        LendingPlatform platform,
        address payable onBehalfOf,
        IERC20Ext token,
        uint256 amount,
        uint256 minReturn
    ) external returns (uint256 returnedAmount);

    function repayBorrowTo(
        LendingPlatform platform,
        address payable onBehalfOf,
        IERC20Ext token,
        uint256 amount,
        uint256 payAmount,
        uint256 rateMode // only for aave v2
    ) external;

    function claimComp(
        address[] calldata holders,
        ICompErc20[] calldata cTokens,
        bool borrowers,
        bool suppliers
    ) external;

    function getLendingToken(LendingPlatform platform, IERC20Ext token) external view returns(address);
}
