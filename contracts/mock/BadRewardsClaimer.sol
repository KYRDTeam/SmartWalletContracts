// SPDX-License-Identifier: MIT
pragma solidity 0.6.6;

import '../reward/RewardsDistributor.sol';

contract BadRewardsClaimer {
    function claim(
        RewardsDistributor _rewardsDistributor,
        uint256 cycle,
        uint256 index,
        address user,
        IERC20Ext[] calldata tokens,
        uint256[] calldata cumulativeAmounts,
        bytes32[] calldata merkleProof
    ) external {
        _rewardsDistributor.claim(cycle, index, user, tokens, cumulativeAmounts, merkleProof);
    }
}
