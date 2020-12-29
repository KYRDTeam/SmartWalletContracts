pragma solidity 0.6.6;

import "../burnHelper/IBurnGasHelper.sol";
import "../interfaces/IKyberProxy.sol";
import "../interfaces/IGasToken.sol";
import "../lending/ISmartWalletLending.sol";
import "@kyber.network/utils-sc/contracts/IERC20Ext.sol";
import "@kyber.network/utils-sc/contracts/Utils.sol";
import "@kyber.network/utils-sc/contracts/Withdrawable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";


contract SmartWalletSwapStorage is Utils, Withdrawable, ReentrancyGuard {

    uint256 constant internal MAX_AMOUNT = uint256(-1);

    mapping (address => mapping(IERC20Ext => uint256)) public platformWalletFees;
    // Proxy and routers will be set only once in constructor
    IKyberProxy public kyberProxy;
    // check if a router (Uniswap or its clones) is supported
    mapping(IUniswapV2Router02 => bool) public isRouterSupported;

    IBurnGasHelper public burnGasHelper;
    mapping (address => bool) public supportedPlatformWallets;

    struct TradeInput {
        uint256 srcAmount;
        uint256 minData; // min rate if Kyber, min return if Uni-pools
        address payable recipient;
        uint256 platformFeeBps;
        address payable platformWallet;
        bytes hint;
    }

    ISmartWalletLending public lendingImpl;

    address public implementation;

    constructor(address _admin) public Withdrawable(_admin) {}
}
