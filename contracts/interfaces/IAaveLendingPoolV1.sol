pragma solidity 0.6.6;


interface IAaveLendingPoolV1 {
    function deposit(address _reserve, uint256 _amount, uint16 _referralCode)
        external
        payable;
    function borrow(
        address _reserve,
        uint256 _amount,
        uint256 _interestRateMode,
        uint16 _referralCode
    )
        external;
    function repay(address _reserve, uint256 _amount, address payable _onBehalfOf)
        external
        payable;
    function core() external view returns (address);
}

interface IAToken {
    function redeem(uint256 _amount) external;
}
