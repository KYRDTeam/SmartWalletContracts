pragma solidity 0.6.6;
pragma experimental ABIEncoderV2;

import "./ILendingPool.sol";

interface IFetchAaveDataWrapper {
    struct ReserveConfigData {
        uint256 ltv;
        uint256 liquidationThreshold;
        uint256 liquidationBonus;
        bool usageAsCollateralEnabled;
        bool borrowingEnabled;
        bool stableBorrowRateEnabled;
        bool isActive;
        address aTokenAddress;
    }

    struct ReserveData {
        uint256 totalLiquidity;
        uint256 availableLiquidity;
        uint256 liquidityRate;
        uint256 utilizationRate;
        uint256 totalBorrowsStable;
        uint256 totalBorrowsVariable;
        uint256 variableBorrowRate;
        uint256 stableBorrowRate;
        uint256 averageStableBorrowRate;
    }

    struct UserAccountData {
        uint256 totalLiquidityETH;
        uint256 totalCollateralETH;
        uint256 totalBorrowsETH;
        uint256 totalFeesETH;
        uint256 availableBorrowsETH;
        uint256 currentLiquidationThreshold;
        uint256 ltv;
        uint256 healthFactor;
    }

    struct UserReserveData {
        uint256 currentATokenBalance;
        uint256 currentBorrowBalance;
        uint256 principalBorrowBalance;
        uint256 borrowRateMode;
        uint256 borrowRate;
        uint256 liquidityRate;
        uint256 originationFee;
        uint256 poolShareInPrecision;
        bool usageAsCollateralEnabled;
    }

    function getReserves(ILendingPool pool) external view returns (address[] memory);
    function getReservesConfigurationData(ILendingPool pool, address[] calldata _reserves)
        external
        view
        returns (
            ReserveConfigData[] memory configsData
        );

    function getReservesData(ILendingPool pool, address[] calldata _reserves)
        external
        view
        returns (
            ReserveData[] memory reservesData
        );

    function getUserAccountsData(ILendingPool pool, address[] calldata _users)
        external
        view
        returns (
            UserAccountData[] memory accountsData
        );

    function getUserReservesData(ILendingPool pool, address[] calldata _reserves, address _user)
        external
        view
        returns (
            UserReserveData[] memory userReservesData
        );

    function getUsersReserveData(ILendingPool pool, address _reserve, address[] calldata _users)
        external
        view
        returns (
            UserReserveData[] memory userReservesData
        );
}
