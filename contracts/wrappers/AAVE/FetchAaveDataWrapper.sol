pragma solidity 0.6.6;
pragma experimental ABIEncoderV2;

import "./IFetchAaveDataWrapper.sol";
import "./ILendingPoolCore.sol";
import "@kyber.network/utils-sc/contracts/Withdrawable.sol";
import "@kyber.network/utils-sc/contracts/IERC20Ext.sol";


/// Fetch data for multiple users or reserves from AAVE
/// Checkout list deployed AAVE's contracts here
/// https://docs.aave.com/developers/deployed-contracts/deployed-contract-instances
contract FetchAaveDataWrapper is Withdrawable, IFetchAaveDataWrapper {

    uint256 constant internal PRECISION = 10**18;

    constructor(address _admin) public Withdrawable(_admin) {}

    function getReserves(ILendingPool pool) external override view
        returns (address[] memory)
    {
        return pool.getReserves();
    }

    function getReservesConfigurationData(ILendingPool pool, address[] calldata _reserves)
        external
        override
        view
        returns (
            ReserveConfigData[] memory configsData
        )
    {
        configsData = new ReserveConfigData[](_reserves.length);
        for(uint256 i = 0; i < _reserves.length; i++) {
            (
                configsData[i].ltv,
                configsData[i].liquidationThreshold,
                configsData[i].liquidationBonus,
                , // rate strategy address
                configsData[i].usageAsCollateralEnabled,
                configsData[i].borrowingEnabled,
                configsData[i].stableBorrowRateEnabled,
                configsData[i].isActive
            ) = pool.getReserveConfigurationData(_reserves[i]);
            configsData[i].aTokenAddress = ILendingPoolCore(pool.core()).getReserveATokenAddress(_reserves[i]);
        }
    }

    function getReservesData(ILendingPool pool, address[] calldata _reserves)
        external
        override
        view
        returns (
            ReserveData[] memory reservesData
        )
    {
        reservesData = new ReserveData[](_reserves.length);
        ILendingPoolCore core = ILendingPoolCore(pool.core());
        for(uint256 i = 0; i < _reserves.length; i++) {
            reservesData[i].totalLiquidity = core.getReserveTotalLiquidity(_reserves[i]);
            reservesData[i].availableLiquidity = core.getReserveAvailableLiquidity(_reserves[i]);
            reservesData[i].utilizationRate = core.getReserveUtilizationRate(_reserves[i]);
            reservesData[i].liquidityRate = core.getReserveCurrentLiquidityRate(_reserves[i]);

            reservesData[i].totalBorrowsStable = core.getReserveTotalBorrowsStable(_reserves[i]);
            reservesData[i].totalBorrowsVariable = core.getReserveTotalBorrowsVariable(_reserves[i]);

            reservesData[i].variableBorrowRate = core.getReserveCurrentVariableBorrowRate(_reserves[i]);
            reservesData[i].stableBorrowRate = core.getReserveCurrentStableBorrowRate(_reserves[i]);
            reservesData[i].averageStableBorrowRate = core.getReserveCurrentAverageStableBorrowRate(_reserves[i]);
        }
    }

    function getUserAccountsData(ILendingPool pool, address[] calldata _users)
        external
        override
        view
        returns (
            UserAccountData[] memory accountsData
        )
    {
        accountsData = new UserAccountData[](_users.length);

        for(uint256 i = 0; i < _users.length; i++) {
            accountsData[i] = getSingleUserAccountData(pool, _users[i]);
        }
    }

    function getUserReservesData(ILendingPool pool, address[] calldata _reserves, address _user)
        external
        override
        view
        returns (
            UserReserveData[] memory userReservesData
        )
    {
        userReservesData = new UserReserveData[](_reserves.length);
        for(uint256 i = 0; i < _reserves.length; i++) {
            userReservesData[i] = getSingleUserReserveData(pool, _reserves[i], _user);
        }
    }

    function getUsersReserveData(ILendingPool pool, address _reserve, address[] calldata _users)
        external
        override
        view
        returns (
            UserReserveData[] memory userReservesData
        )
    {
        userReservesData = new UserReserveData[](_users.length);
        for(uint256 i = 0; i < _users.length; i++) {
            userReservesData[i] = getSingleUserReserveData(pool, _reserve, _users[i]);
        }
    }

    function getSingleUserReserveData(ILendingPool pool, address _reserve, address _user)
        public view returns (
            UserReserveData memory data
        )
    {
        (
            data.currentATokenBalance,
            data.currentBorrowBalance,
            data.principalBorrowBalance,
            data.borrowRateMode,
            data.borrowRate,
            data.liquidityRate,
            data.originationFee,
            ,
            ,
            data.usageAsCollateralEnabled
        ) = pool.getUserReserveData(_reserve, _user);
        IERC20Ext aToken = IERC20Ext(ILendingPoolCore(pool.core()).getReserveATokenAddress(_reserve));
        uint256 totalSupply = aToken.totalSupply();
        if (totalSupply > 0) {
            data.poolShareInPrecision = aToken.balanceOf(_user) / totalSupply;
        }
    }

    function getSingleUserAccountData(ILendingPool pool, address _user)
        public view returns (UserAccountData memory data)
    {
        (
            data.totalLiquidityETH,
            data.totalCollateralETH,
            data.totalBorrowsETH,
            data.totalFeesETH,
            data.availableBorrowsETH,
            data.currentLiquidationThreshold,
            data.ltv,
            data.healthFactor
        ) = pool.getUserAccountData(_user);
    }
}
