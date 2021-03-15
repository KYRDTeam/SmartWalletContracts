const artifacts = require('hardhat').artifacts
const BN = web3.utils.BN;

const FetchAaveDataWrapper = artifacts.require('FetchAaveDataWrapper.sol');
const LendingPool = artifacts.require('ILendingPoolV1.sol');

let fetchDataWrapper;
let fetchDataWrapperAddr;

let mainnetLendingPool = '0x398eC7346DcD622eDc5ae82352F02bE94C62d119';

let deployer;

async function main() {
  const accounts = await web3.eth.getAccounts();
  deployer = accounts[0];
  console.log(`Deployer address at ${deployer}`);

  gasPrice = new BN(110).mul(new BN(10).pow(new BN(9)));
  console.log(`Sending transactions with gas price: ${gasPrice.toString(10)} (${gasPrice.div(new BN(10).pow(new BN(9))).toString(10)} gweis)`);

  // let lendingPool = await LendingPool.at(mainnetLendingPool);
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

  let userData = await fetchDataWrapper.getSingleUserAccountData(mainnetLendingPool, true, deployer);
  console.log(userData);
  userData = await fetchDataWrapper.getSingleUserReserveData(mainnetLendingPool, true, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', deployer);
  console.log(userData);
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
