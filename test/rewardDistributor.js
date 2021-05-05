const RewardsDistributor = artifacts.require('RewardsDistributor.sol');
const Token = artifacts.require('MockToken.sol');
const BadRewardsClaimer = artifacts.require('BadRewardsClaimer.sol');
const NonePayableContract = artifacts.require('NonePayableContract.sol');

const parseRewards = require('../scripts/merkleDist/parseRewards').parseRewards;
const Helper = require('./helper.js');
const { precisionUnits, zeroBN, ethAddress } = require('./helper.js');
const { genRandomBN } = require('./randomNumberGenerator.js');
const { keccak256, defaultAbiCoder } = require('ethers').utils;
const BN = web3.utils.BN;
const ethersBN = require('ethers').BigNumber;
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

// EOAs
let admin;
let victor;
let loi;
let mike;

// tokens
let tokens;
let tokenAddresses;
let tokenAmount;
let ethAmount;
let knc;
let usdc;
let wbtc;

// contracts
let rewardsDistributor;

// misc variables
let cycle;
let index;
let root;
let contentHash = 'https://krystal.app';
let amounts;
let currentClaimAmounts;

let rewardClaims;

let maxIncrease = precisionUnits.div(new BN(5));

contract('RewardsDistributor', function (accounts) {
  before('one time init', async () => {
    admin = accounts[1];
    tokenAmount = precisionUnits.mul(new BN(100000000));
    knc = await Token.new('Kyber Network Crystal', 'KNC', tokenAmount);
    usdc = await Token.new('USD Coin', 'USDC', tokenAmount);
    wbtc = await Token.new('Wrapped Bitcoin', 'WBTC', tokenAmount);
    tokens = [knc, usdc, wbtc];
    tokenAddresses = [knc.address, usdc.address, wbtc.address, ethAddress];
    victor = accounts[2];
    loi = accounts[3];
    mike = accounts[4];

    // setup rewards distributor
    rewardsDistributor = await RewardsDistributor.new(admin);

    // send 5M of each token and 1000 eth to treasury
    tokenAmount = precisionUnits.mul(new BN(5000000));
    ethAmount = precisionUnits.mul(new BN(1000));
  });

  it('should have root updated by admin only', async () => {
    cycle = new BN(1);
    root = '0x1';

    await expectRevert(rewardsDistributor.proposeRoot(cycle, root, contentHash), 'only admin');
    await expectRevert(rewardsDistributor.proposeRoot(cycle, root, contentHash, { from: victor }), 'only admin');
    await expectRevert(rewardsDistributor.proposeRoot(cycle, root, contentHash, { from: mike }), 'only admin');

    let tx = await rewardsDistributor.proposeRoot(cycle, root, contentHash, { from: admin });
    let expectedRoot = root.padEnd(66, '0');
    expectEvent(tx, 'RootUpdated', {
      cycle: cycle,
      root: expectedRoot,
      contentHash: contentHash,
    });
    let result = await rewardsDistributor.getMerkleData();
    Helper.assertEqual(result.cycle, cycle, 'root not updated');
    Helper.assertEqual(result.root, expectedRoot, 'root not updated');
    Helper.assertEqual(result.contentHash, contentHash, 'root not updated');
  });

  it('should fail to update root for bad cycle', async () => {
    cycle = new BN(20);
    root = '0x1';
    await expectRevert(rewardsDistributor.proposeRoot(cycle, root, contentHash, { from: admin }), 'incorrect cycle');
  });

  it('should verify the hash obtained from encoding claims', async () => {
    cycle = 5;
    index = 10;
    amounts = [100, 200, 300, 400];
    let expected = encodeData(cycle, index, loi, tokenAddresses, amounts);
    let actual = await rewardsDistributor.encodeClaim(cycle, index, loi, tokenAddresses, amounts);
    Helper.assertEqual(expected.encodedData, actual.encodedData, 'encoded data not matching');
    Helper.assertEqual(expected.encodedDataHash, actual.encodedDataHash, 'encoded data hash not matching');

    cycle = 0;
    index = 0;
    expected = encodeData(cycle, index, loi, [], []);
    actual = await rewardsDistributor.encodeClaim(cycle, index, loi, [], []);
    Helper.assertEqual(expected.encodedData, actual.encodedData, 'encoded data not matching');
    Helper.assertEqual(expected.encodedDataHash, actual.encodedDataHash, 'encoded data hash not matching');
  });

  it('should revert encoding claims for incorrect token and amount lengths', async () => {
    cycle = 5;
    index = 10;
    amounts = [100, 200, 300];
    await expectRevert(
      rewardsDistributor.encodeClaim(cycle, index, loi, tokenAddresses, amounts),
      'bad tokens and amounts length'
    );

    amounts = [100, 200, 300, 400, 500];
    await expectRevert(
      rewardsDistributor.encodeClaim(cycle, index, loi, tokenAddresses, amounts),
      'bad tokens and amounts length'
    );
  });

  describe('test claims', async () => {
    before('set initial cycle and deposit fund', async () => {
      cycle = new BN((await rewardsDistributor.getMerkleData()).cycle);

      await Promise.all(
        tokens.map(async (token, index) => {
          await token.transfer(rewardsDistributor.address, tokenAmount);
        })
      );
      await Helper.sendEtherWithPromise(accounts[5], rewardsDistributor.address, ethAmount);
    });

    it('should fail when the distributor is paused', async () => {
      await rewardsDistributor.addOperator(accounts[1], { from: admin });
      await rewardsDistributor.pause({ from: accounts[1] });

      await expectRevert(
        rewardsDistributor.claim(
          cycle,
          new BN(0),
          accounts[0],
          [tokenAddresses[0]],
          [new BN(0)],
          ['0x']
        ),
        'only when not paused'
      );

      await rewardsDistributor.unpause({ from: admin });
      await rewardsDistributor.removeOperator(accounts[1], { from: admin });
    })

    describe('test with randomly generated increasing rewards', async () => {
      beforeEach('increment cycle, generate claims and submit root', async () => {
        cycle = cycle.add(new BN(1));
        currentClaimAmounts = await fetchCurrentClaimAmounts(rewardsDistributor, [victor, mike, loi], tokenAddresses);
        rewardClaims = generateRewardClaims(cycle, [victor, mike, loi], tokenAddresses, currentClaimAmounts);
        await rewardsDistributor.proposeRoot(cycle, rewardClaims.merkleRoot, contentHash, { from: admin });
      });

      it('should return true for valid claims checks, false otherwise', async () => {
        for (const [account, userClaim] of Object.entries(rewardClaims.userRewards)) {
          // valid
          assert.isTrue(
            await rewardsDistributor.isValidClaim(
              cycle,
              userClaim.index,
              account,
              userClaim.tokens,
              userClaim.cumulativeAmounts,
              userClaim.proof
            ),
            'valid claim is deemed invalid'
          );

          // invalid cycle
          assert.isFalse(
            await rewardsDistributor.isValidClaim(
              cycle.add(new BN(1)),
              userClaim.index,
              account,
              userClaim.tokens,
              userClaim.cumulativeAmounts,
              userClaim.proof
            ),
            'invalid claim is deemed valid'
          );

          // invalid index
          assert.isFalse(
            await rewardsDistributor.isValidClaim(
              cycle,
              new BN(1).add(new BN(userClaim.index)),
              account,
              userClaim.tokens,
              userClaim.cumulativeAmounts,
              userClaim.proof
            ),
            'invalid claim is deemed valid'
          );

          // invalid account
          assert.isFalse(
            await rewardsDistributor.isValidClaim(
              cycle,
              userClaim.index,
              admin,
              userClaim.tokens,
              userClaim.cumulativeAmounts,
              userClaim.proof
            ),
            'invalid claim is deemed valid'
          );

          // invalid tokens: bad lengths
          assert.isFalse(
            await rewardsDistributor.isValidClaim(
              cycle,
              userClaim.index,
              account,
              tokenAddresses.slice(1),
              userClaim.cumulativeAmounts,
              userClaim.proof
            ),
            'invalid claim is deemed valid'
          );

          // invalid amounts: bad lengths
          assert.isFalse(
            await rewardsDistributor.isValidClaim(
              cycle,
              userClaim.index,
              account,
              tokenAddresses,
              userClaim.cumulativeAmounts.slice(1),
              userClaim.proof
            ),
            'invalid claim is deemed valid'
          );

          // invalid tokens and amounts: bad lengths
          assert.isFalse(
            await rewardsDistributor.isValidClaim(
              cycle,
              userClaim.index,
              account,
              tokenAddresses.slice(1),
              [tokenAddresses[0]].concat(userClaim.cumulativeAmounts),
              userClaim.proof
            ),
            'invalid claim is deemed valid'
          );

          // invalid tokens and amounts: bad lengths
          assert.isFalse(
            await rewardsDistributor.isValidClaim(
              cycle,
              userClaim.index,
              account,
              [tokenAddresses[0]].concat(tokenAddresses),
              userClaim.cumulativeAmounts.slice(1),
              userClaim.proof
            ),
            'invalid claim is deemed valid'
          );

          // invalid proof
          assert.isFalse(
            await rewardsDistributor.isValidClaim(
              cycle,
              userClaim.index,
              account,
              tokenAddresses,
              userClaim.cumulativeAmounts,
              ['0x123']
            ),
            'invalid claim is deemed valid'
          );
        }
      });

      it('should fail claims in invalid cycle', async () => {
        const [account, userClaim] = Object.entries(rewardClaims.userRewards)[0];
        await expectRevert(
          rewardsDistributor.claim(
            cycle.add(new BN(1)),
            userClaim.index,
            account,
            tokenAddresses,
            userClaim.cumulativeAmounts,
            userClaim.proof
          ),
          'invalid claim data'
        );
      });

      it('should fail claim from invalid proof', async () => {
        const [account, userClaim] = Object.entries(rewardClaims.userRewards)[0];
        // wrong account
        await expectRevert(
          rewardsDistributor.claim(
            cycle,
            userClaim.index,
            admin,
            tokenAddresses,
            userClaim.cumulativeAmounts,
            userClaim.proof
          ),
          'invalid claim data'
        );
      });

      it('should successfully claim tokens', async () => {
        for (const [account, userClaim] of Object.entries(rewardClaims.userRewards)) {
          let tokenBalancesBefore = await fetchTokenBalances(tokenAddresses, account);
          let claimAmountsBefore = await rewardsDistributor.getClaimedAmounts(account, tokenAddresses);

          await rewardsDistributor.claim(
            cycle,
            userClaim.index,
            account,
            tokenAddresses,
            userClaim.cumulativeAmounts,
            userClaim.proof,
            { from: account }
          );
          let claimAmountsAfter = await rewardsDistributor.getClaimedAmounts(account, tokenAddresses);
          let tokenBalancesAfter = await fetchTokenBalances(tokenAddresses, account);

          for (let i = 0; i < tokenBalancesAfter.length; i++) {
            // for ether, assert greater due to gas costs
            if (tokenAddresses[i] == ethAddress) {
              Helper.assertGreater(tokenBalancesAfter[i], tokenBalancesBefore[i], 'eth balance didnt increase');
              Helper.assertGreater(claimAmountsAfter[i], claimAmountsBefore[i], 'claim amount didnt increase');
            } else {
              // check that claim amount correspond to user balance increase
              Helper.assertEqual(
                tokenBalancesAfter[i].sub(tokenBalancesBefore[i]),
                claimAmountsAfter[i].sub(claimAmountsBefore[i]),
                'claim amount != token balance increase'
              );
            }
          }
        }
      });

      it('should revert if token and amount lengths are not equal', async () => {
        const [account, userClaim] = Object.entries(rewardClaims.userRewards)[0];
        await expectRevert(
          rewardsDistributor.claim(
            cycle,
            userClaim.index,
            account,
            [tokenAddresses[0]].concat(tokenAddresses),
            userClaim.cumulativeAmounts,
            userClaim.proof
          ),
          'invalid claim data'
        );

        await expectRevert(
          rewardsDistributor.claim(
            cycle,
            userClaim.index,
            account,
            tokenAddresses,
            [userClaim.cumulativeAmounts[0]].concat(userClaim.cumulativeAmounts),
            userClaim.proof
          ),
          'invalid claim data'
        );

        // token mistaken as amount
        await expectRevert(
          rewardsDistributor.claim(
            cycle,
            userClaim.index,
            account,
            tokenAddresses.splice(0, tokenAddresses.length - 1),
            [tokenAddresses[tokenAddresses.length - 1]].concat(userClaim.cumulativeAmounts),
            userClaim.proof
          ),
          'invalid claim data'
        );
      });
    });

    describe('test with fixed claim rewards', async () => {
      beforeEach('increment cycle and fetch current claim amounts only', async () => {
        cycle = cycle.add(new BN(1));
        currentClaimAmounts = await fetchCurrentClaimAmounts(rewardsDistributor, [victor, mike, loi], tokenAddresses);
      });

      it('should successfully claim when cumulativeAmounts is zero for one or more tokens', async () => {
        // add random token with 0 cumulative amount
        for (let i = 0; i < currentClaimAmounts.length; i++) {
          currentClaimAmounts[i].push(zeroBN);
        }

        await generateAndClaimRewards(
          rewardsDistributor,
          cycle,
          [victor, mike, loi],
          tokenAddresses.concat([victor]),
          currentClaimAmounts,
          false
        );

        // increment cycle
        cycle = cycle.add(new BN(1));

        // add another token with 0 cumulative amount
        for (let i = 0; i < currentClaimAmounts.length; i++) {
          currentClaimAmounts[i].push(zeroBN);
        }

        await generateAndClaimRewards(
          rewardsDistributor,
          cycle,
          [victor, mike, loi],
          tokenAddresses.concat([victor, mike]),
          currentClaimAmounts,
          false
        );
      });

      it('should successfully claim when claimable is 0 for one or more tokens', async () => {
        let account = victor;
        await generateAndClaimRewards(rewardsDistributor, cycle, [account], tokenAddresses, currentClaimAmounts, true);

        // increment cycle
        cycle = cycle.add(new BN(1));

        // fetch current claim amounts
        currentClaimAmounts = await rewardsDistributor.getClaimedAmounts(account, tokenAddresses);
        // keep first claim amount fixed, increase the rest
        let newClaimAmounts = increaseTokenClaimAmounts(currentClaimAmounts);
        newClaimAmounts[0] = currentClaimAmounts[0];

        await generateAndClaimRewards(rewardsDistributor, cycle, [account], tokenAddresses, [newClaimAmounts], false);
      });

      it('should revert from integer underflow if claimable amount < claimed', async () => {
        let account = victor;
        await generateAndClaimRewards(rewardsDistributor, cycle, [account], tokenAddresses, currentClaimAmounts, true);

        // increment cycle
        cycle = cycle.add(new BN(1));

        // fetch current claim amounts
        currentClaimAmounts = await rewardsDistributor.getClaimedAmounts(account, tokenAddresses);
        // decrease first claim amount, increase the rest
        let newClaimAmounts = increaseTokenClaimAmounts(currentClaimAmounts);
        newClaimAmounts[0] = currentClaimAmounts[0].sub(new BN(100));

        let rewardClaims = generateRewardClaims(cycle, [account], tokenAddresses, [newClaimAmounts], false);
        await rewardsDistributor.proposeRoot(cycle, rewardClaims.merkleRoot, contentHash, { from: admin });

        let userClaim = rewardClaims.userRewards[account];
        await expectRevert(
          rewardsDistributor.claim(
            cycle,
            userClaim.index,
            account,
            tokenAddresses,
            userClaim.cumulativeAmounts,
            userClaim.proof,
            { from: account }
          ),
          'SafeMath: subtraction overflow'
        );
      });

      it('should successfully claim even though there are multiple instances of the same token, under the right conditions', async () => {
        let account = victor;
        let tempTokenAddresses = [knc.address, knc.address];
        currentClaimAmounts = currentClaimAmounts[0];
        let currentTokenClaimAmt = currentClaimAmounts[0];
        currentClaimAmounts = [currentTokenClaimAmt.add(new BN(5000)), currentTokenClaimAmt.add(new BN(8000))];
        // should be claimable
        await generateAndClaimRewards(
          rewardsDistributor,
          cycle,
          [account],
          tempTokenAddresses,
          [currentClaimAmounts],
          false
        );

        // increment cycle
        cycle = cycle.add(new BN(1));

        // earlier amount > later amount, expect revert
        currentClaimAmounts = [currentTokenClaimAmt.add(new BN(8001)), currentTokenClaimAmt.add(new BN(8000))];
        let rewardClaims = generateRewardClaims(cycle, [account], tempTokenAddresses, [currentClaimAmounts], false);
        await rewardsDistributor.proposeRoot(cycle, rewardClaims.merkleRoot, contentHash, { from: admin });

        let userClaim = rewardClaims.userRewards[account];
        await expectRevert(
          rewardsDistributor.claim(
            cycle,
            userClaim.index,
            account,
            tempTokenAddresses,
            userClaim.cumulativeAmounts,
            userClaim.proof,
            { from: account }
          ),
          'SafeMath: subtraction overflow'
        );

        // increment cycle
        cycle = cycle.add(new BN(1));

        // increase reward amounts
        currentClaimAmounts = [currentTokenClaimAmt.add(new BN(8001)), currentTokenClaimAmt.add(new BN(8002))];

        // should still be claimable
        await generateAndClaimRewards(
          rewardsDistributor,
          cycle,
          [account],
          tempTokenAddresses,
          [currentClaimAmounts],
          false
        );
      });

      it('should fail when non-payable contract tries to claim ether', async () => {
        let badRewardsClaimer = await BadRewardsClaimer.new();
        let account = badRewardsClaimer.address;

        let rewardClaims = generateRewardClaims(cycle, [account], [ethAddress], [[new BN(1000)]], false);
        await rewardsDistributor.proposeRoot(cycle, rewardClaims.merkleRoot, contentHash, { from: admin });

        let userClaim = rewardClaims.userRewards[account];
        await expectRevert(
          badRewardsClaimer.claim(
            rewardsDistributor.address,
            cycle,
            userClaim.index,
            account,
            [ethAddress],
            userClaim.cumulativeAmounts,
            userClaim.proof
          ),
          'eth transfer failed'
        );
      });
    });
  });

  describe('#pause & unpause', async () => {
    it('pause - revert not operator', async () => {
      await expectRevert(rewardsDistributor.pause({ from: accounts[0] }), 'only operator');
    });

    it('pause - records data and event', async () => {
      await rewardsDistributor.addOperator(accounts[0], { from: admin });
      let tx = await rewardsDistributor.pause({ from: accounts[0] });
      expectEvent(tx, 'Paused', {
        sender: accounts[0],
      });
      Helper.assertEqual(true, await rewardsDistributor.isPaused());

      // duplicated action, but still allowed
      tx = await rewardsDistributor.pause({ from: accounts[0] });
      expectEvent(tx, 'Paused', {
        sender: accounts[0],
      });
      Helper.assertEqual(true, await rewardsDistributor.isPaused());
      await rewardsDistributor.removeOperator(accounts[0], { from: admin });
    });

    it('unpause - revert not admin', async () => {
      await expectRevert(rewardsDistributor.unpause({ from: accounts[0] }), 'only admin');
      await rewardsDistributor.addOperator(accounts[0], { from: admin });
      await expectRevert(rewardsDistributor.unpause({ from: accounts[0] }), 'only admin');
      await rewardsDistributor.removeOperator(accounts[0], { from: admin });
    });

    it('unpause - records data and event', async () => {
      let tx = await rewardsDistributor.unpause({ from: admin });
      expectEvent(tx, 'Unpaused', {
        sender: admin,
      });
      Helper.assertEqual(false, await rewardsDistributor.isPaused());

      // duplicated action, but still allowed
      tx = await rewardsDistributor.unpause({ from: admin });
      expectEvent(tx, 'Unpaused', {
        sender: admin,
      });
      Helper.assertEqual(false, await rewardsDistributor.isPaused());
    });
  });

  describe('#withdraw funds', async () => {
    beforeEach('pause', async () => {
      await rewardsDistributor.addOperator(accounts[1], { from: admin });
      await rewardsDistributor.pause({ from: accounts[1] });
    });

    afterEach('unpause', async () => {
      await rewardsDistributor.unpause({ from: admin });
      await rewardsDistributor.removeOperator(accounts[1], { from: admin });
    });


    it('revert - when unpaused', async () => {
      await rewardsDistributor.unpause({ from: admin });
      await expectRevert(
        rewardsDistributor.withdrawFunds([ethAddress], [new BN(10)], admin, { from: admin }),
        'only when paused'
      );
    });

    it('revert - invalid lengths for tokens and amounts', async () => {
      await expectRevert(rewardsDistributor.withdrawFunds([ethAddress], [], admin, { from: admin }), 'invalid lengths');
      await expectRevert(
        rewardsDistributor.withdrawFunds([ethAddress], [new BN(1), new BN(2)], admin, { from: admin }),
        'invalid lengths'
      );
    });

    it('revert - transfer eth to none-payable contract', async () => {
      let contract = await NonePayableContract.new();

      await Helper.sendEtherWithPromise(accounts[0], rewardsDistributor.address, new BN(1));
      await expectRevert(
        rewardsDistributor.withdrawFunds([ethAddress], [new BN(1)], contract.address, { from: admin }),
        'transfer eth failed'
      );
    });

    it('revert - balance not enough', async () => {
      let ethBalance = await Helper.getBalancePromise(rewardsDistributor.address);
      await expectRevert(
        rewardsDistributor.withdrawFunds([ethAddress], [ethBalance.add(new BN(1))], admin, { from: admin }),
        'transfer eth failed'
      );
    });

    it('correct balances changed', async () => {
      await Helper.sendEtherWithPromise(accounts[0], rewardsDistributor.address, new BN(20));
      let tokenAmount = new BN(200);
      let token = await Token.new('Custom', 'TKT', tokenAmount);

      await token.transfer(rewardsDistributor.address, tokenAmount);

      let recipient = accounts[5];
      let ethBalRecipientBefore = await Helper.getBalancePromise(recipient);
      let tokenBalRecipientBefore = await token.balanceOf(recipient);
      let ethBalPoolBefore = await Helper.getBalancePromise(rewardsDistributor.address);
      let tokenBalPoolBefore = await token.balanceOf(rewardsDistributor.address);

      let ethAmount = await Helper.getBalancePromise(rewardsDistributor.address);
      ethAmount = ethAmount.div(new BN(2));
      tokenAmount = await token.balanceOf(rewardsDistributor.address);
      tokenAmount = tokenAmount.div(new BN(3));

      let tx = await rewardsDistributor.withdrawFunds([ethAddress, token.address], [ethAmount, tokenAmount], recipient, {
        from: admin,
      });

      Helper.assertEqual(ethBalRecipientBefore.add(ethAmount), await Helper.getBalancePromise(recipient));
      Helper.assertEqual(tokenBalRecipientBefore.add(tokenAmount), await token.balanceOf(recipient));
      Helper.assertEqual(ethBalPoolBefore.sub(ethAmount), await Helper.getBalancePromise(rewardsDistributor.address));
      Helper.assertEqual(tokenBalPoolBefore.sub(tokenAmount), await token.balanceOf(rewardsDistributor.address));

      let id = 0;
      for (let i = 0; i < tx.receipt.logs.length; i++) {
        if (tx.receipt.logs[i].event == 'WithdrawToken') {
          if (id == 0) {
            // withdraw eth event
            id++;
            Helper.assertEqual(ethAddress, tx.receipt.logs[i].args.token);
            Helper.assertEqual(admin, tx.receipt.logs[i].args.sender);
            Helper.assertEqual(recipient, tx.receipt.logs[i].args.recipient);
            Helper.assertEqual(ethAmount, tx.receipt.logs[i].args.amount);
          } else {
            // withdraw token event
            Helper.assertEqual(token.address, tx.receipt.logs[i].args.token);
            Helper.assertEqual(admin, tx.receipt.logs[i].args.sender);
            Helper.assertEqual(recipient, tx.receipt.logs[i].args.recipient);
            Helper.assertEqual(tokenAmount, tx.receipt.logs[i].args.amount);
          }
        }
      }
    });
  });
});

function encodeData(cycle, index, account, tokens, amounts) {
  let encodedData = defaultAbiCoder.encode(
    ['uint256', 'uint256', 'address', 'address[]', 'uint256[]'],
    [
      ethersBN.from(cycle.toString()),
      ethersBN.from(index.toString()),
      account,
      tokens,
      amounts.map((amount) => ethersBN.from(amount.toString())),
    ]
  );
  return {
    encodedData: encodedData,
    encodedDataHash: keccak256(encodedData),
  };
}

async function fetchCurrentClaimAmounts(rewardsDistributor, accounts, tokens) {
  return await Promise.all(
    accounts.map(async (account, index) => {
      return await rewardsDistributor.getClaimedAmounts(account, tokens);
    })
  );
}

function generateRewardClaims(cycle, accounts, tokenAddresses, currentClaimAmounts, increaseClaim = true) {
  let userRewards = {};
  for (let i = 0; i < accounts.length; i++) {
    userRewards[accounts[i]] = {
      tokens: tokenAddresses,
      cumulativeAmounts: increaseClaim
        ? increaseTokenClaimAmounts(currentClaimAmounts[i])
        : convertToString(currentClaimAmounts[i]),
    };
  }
  return parseRewards({
    cycle: cycle,
    userRewards: userRewards,
  });
}

function increaseTokenClaimAmounts(currentClaimAmounts) {
  let amounts = [];
  for (let i = 0; i < currentClaimAmounts.length; i++) {
    let increment = genRandomBN(zeroBN, maxIncrease);
    amounts.push(currentClaimAmounts[i].add(increment).toString());
  }
  return amounts;
}

function convertToString(array) {
  return array.map((el) => el.toString());
}

async function generateAndClaimRewards(
  rewardsDistributor,
  cycle,
  accounts,
  tokenAddresses,
  claimAmounts,
  increaseClaim = true
) {
  let rewardClaims = generateRewardClaims(cycle, accounts, tokenAddresses, claimAmounts, increaseClaim);
  await rewardsDistributor.proposeRoot(cycle, rewardClaims.merkleRoot, contentHash, { from: admin });

  for (const [account, userClaim] of Object.entries(rewardClaims.userRewards)) {
    await rewardsDistributor.claim(
      cycle,
      userClaim.index,
      account,
      tokenAddresses,
      userClaim.cumulativeAmounts,
      userClaim.proof,
      { from: account }
    );
  }
}

async function fetchTokenBalances(tokenAddresses, account) {
  return await Promise.all(
    tokenAddresses.map(async (tokenAddress, index) => {
      return tokenAddress == ethAddress
        ? await Helper.getBalancePromise(account)
        : await tokens[index].balanceOf(account);
    })
  );
}
