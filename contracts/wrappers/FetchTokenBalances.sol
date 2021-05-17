pragma solidity 0.6.6;

import "@kyber.network/utils-sc/contracts/Withdrawable.sol";
import "@kyber.network/utils-sc/contracts/IERC20Ext.sol";


contract FetchTokenBalances is Withdrawable {

    IERC20Ext internal constant ETH_TOKEN_ADDRESS = IERC20Ext(
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
    );

    constructor (address _admin) public Withdrawable(_admin) {}

    function getBalances(address account, IERC20Ext[] calldata tokens)
        external view
        returns(uint256[] memory balances)
    {
        balances = new uint[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == ETH_TOKEN_ADDRESS) {
                balances[i] = account.balance;
            } else {
                try tokens[i].balanceOf(account) returns (uint256 bal) {
                    balances[i] = bal;
                } catch {}
            }
        }
    }
}
