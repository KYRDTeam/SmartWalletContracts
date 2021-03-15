pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@kyber.network/utils-sc/contracts/IBEP20.sol";
import "../interfaces/IBnb.sol";
import "../interfaces/IVBep20.sol";


interface ISmartWalletLending {

    enum LendingPlatform { VENUS }

    function updateVenusData(
        address _comptroller,
        address _vBnb,
        address[] calldata _vTokens
    ) external;

    function depositTo(
        LendingPlatform platform,
        address payable onBehalfOf,
        IBEP20 token,
        uint256 amount
    ) external;

    function withdrawFrom(
        LendingPlatform platform,
        address payable onBehalfOf,
        IBEP20 token,
        uint256 amount,
        uint256 minReturn
    ) external returns (uint256 returnedAmount);

    function repayBorrowTo(
        LendingPlatform platform,
        address payable onBehalfOf,
        IBEP20 token,
        uint256 amount,
        uint256 payAmount
    ) external;

    function storeAndRetrieveUserDebtCurrent(
        LendingPlatform platform,
        address _reserve,
        address _user
    ) external returns (uint256 debt);

    function getLendingToken(LendingPlatform platform, IBEP20 token) external view returns(address);

    function getUserDebtStored(LendingPlatform platform, address reserve, address user)
        external
        view
        returns (uint256 debt);
}
