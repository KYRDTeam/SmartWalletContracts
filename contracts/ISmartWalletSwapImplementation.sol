pragma solidity 0.6.6;

import "@kyber.network/utils-sc/contracts/IERC20Ext.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";


interface ISmartWalletSwapImplementation {
    function getExpectedReturnKyber(
        IERC20Ext src,
        IERC20Ext dest,
        uint256 srcAmount,
        uint256 platformFee,
        bytes calldata hint
    ) external view returns (
        uint256 destAmount,
        uint256 expectedRate
    );

    function getExpectedReturnUniswap(
        IUniswapV2Router02 router,
        uint256 srcAmount,
        address[] calldata tradePath,
        uint256 platformFee
    ) external view returns (
        uint256 destAmount,
        uint256 expectedRate
    );

    function swapKyber(
        IERC20Ext src,
        IERC20Ext dest,
        uint256 srcAmount,
        uint256 minConversionRate,
        address payable recipient,
        uint256 platformFee,
        address payable platformWallet,
        bytes calldata hint,
        bool useGasToken
    ) external payable returns (uint256 destAmount);

    function swapUniswap(
        IUniswapV2Router02 router,
        uint256 srcAmount,
        uint256 minDestAmount,
        address[] calldata tradePath,
        address payable recipient,
        uint256 platformFee,
        address payable platformWallet,
        bool useGasToken
    ) external payable returns (uint256 destAmount);
}
