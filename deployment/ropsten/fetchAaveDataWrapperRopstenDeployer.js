const artifacts = require('hardhat').artifacts
const BN = web3.utils.BN;

const FetchAaveDataWrapper = artifacts.require('FetchAaveDataWrapper.sol');
const LendingPool = artifacts.require('ILendingPool.sol');

let fetchDataWrapper;
let fetchDataWrapperAddr;

let ropstenLendingPool = '0x9E5C7835E4b13368fd628196C4f1c6cEc89673Fa';

let deployer;

async function main() {
  const accounts = await web3.eth.getAccounts();
  deployer = accounts[0];
  console.log(`Deployer address at ${deployer}`);

  gasPrice = new BN(2).mul(new BN(10).pow(new BN(9)));
  console.log(`Sending transactions with gas price: ${gasPrice.toString(10)} (${gasPrice.div(new BN(10).pow(new BN(9))).toString(10)} gweis)`);

  // let lendingPool = await LendingPool.at(ropstenLendingPool);
  // await lendingPool.deposit(
  //   '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // reserve address
  //   new BN(10).pow(new BN(17)), // amount
  //   0, // referal code
  //   { value: new BN(10).pow(new BN(17)), gasPrice: gasPrice, gas: 1000000 }
  // );

  if (fetchDataWrapperAddr == undefined) {
    fetchDataWrapper = await FetchAaveDataWrapper.new(deployer);
    fetchDataWrapperAddr = fetchDataWrapper.address;
    console.log(`Deployed fetch aave data wrapper at ${fetchDataWrapper.address}`);
  } else {
    fetchDataWrapper = await FetchAaveDataWrapper.at(fetchDataWrapperAddr);
    console.log(`Interacting fetch aave data wrapper at ${fetchDataWrapper.address}`);
  }

  let userData = await fetchDataWrapper.getSingleUserAccountData(ropstenLendingPool, deployer);
  console.log(userData);
  userData = await fetchDataWrapper.getSingleUserReserveData(ropstenLendingPool, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', deployer);
  console.log(userData);
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
