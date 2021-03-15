const artifacts = require('hardhat').artifacts
const BN = web3.utils.BN;

const FetchAaveDataWrapper = artifacts.require('FetchAaveDataWrapper.sol');
const LendingPoolV1 = artifacts.require('ILendingPoolV1.sol');
const LendingPoolV2 = artifacts.require('ILendingPoolV2.sol');

let fetchDataWrapper;
let fetchDataWrapperAddr;

let kovanLendingPoolV1 = '0x580D4Fdc4BF8f9b5ae2fb9225D584fED4AD5375c';
let kovanLendingPoolV2 = '0xE0fBa4Fc209b4948668006B2bE61711b7f465bAe';
let kovanProtocolDataProvider = '0x3c73A5E5785cAC854D468F727c606C07488a29D6';

let deployer;

async function main() {
  const accounts = await web3.eth.getAccounts();
  deployer = accounts[0];
  console.log(`Deployer address at ${deployer}`);

  gasPrice = new BN(2).mul(new BN(10).pow(new BN(9)));
  console.log(`Sending transactions with gas price: ${gasPrice.toString(10)} (${gasPrice.div(new BN(10).pow(new BN(9))).toString(10)} gweis)`);

  // let lendingPoolV1 = await LendingPoolV1.at(kovanLendingPoolV1);
  // await lendingPoolV1.deposit(
  //   '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // reserve address
  //   new BN(10).pow(new BN(15)), // amount
  //   0, // referal code
  //   { value: new BN(10).pow(new BN(15)), gasPrice: gasPrice, gas: 1000000 }
  // );

  if (fetchDataWrapperAddr == undefined) {
    fetchDataWrapper = await FetchAaveDataWrapper.new(deployer);
    fetchDataWrapperAddr = fetchDataWrapper.address;
    console.log(`Deployed fetch aave data wrapper at ${fetchDataWrapper.address}`);
  } else {
    fetchDataWrapper = await FetchAaveDataWrapper.at(fetchDataWrapperAddr);
    console.log(`Interacting fetch aave data wrapper at ${fetchDataWrapper.address}`);
  }

  let userData;
  let reserveData;
  let reservesV1 = await fetchDataWrapper.getReserves(kovanLendingPoolV1, true);
  console.log(`AAVE v1 reserves: ${reservesV1}`);
  let reservesV2 = await fetchDataWrapper.getReserves(kovanLendingPoolV2, false);
  console.log(`AAVE v2 reserves: ${reservesV2}`);

  console.log(`AAVE v1 data`);
  userData = await fetchDataWrapper.getSingleUserAccountData(kovanLendingPoolV1, true, deployer);
  console.log(`user account data: ${userData}`);
  userData = await fetchDataWrapper.getSingleUserReserveDataV1(kovanLendingPoolV1, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', deployer);
  console.log(`user reserve data: ${userData}`);
  reserveData = await fetchDataWrapper.getReservesConfigurationData(kovanLendingPoolV1, true, [reservesV1[0]]);
  console.log(`reserve config data: ${reserveData}`);
  reserveData = await fetchDataWrapper.getReservesData(kovanLendingPoolV1, true, [reservesV1[0]]);
  console.log(`reserve data: ${reserveData}`);

  console.log(`AAVE v2 data`);
  userData = await fetchDataWrapper.getSingleUserAccountData(kovanLendingPoolV2, false, deployer);
  console.log(`user account data: ${userData}`);
  userData = await fetchDataWrapper.getSingleUserReserveDataV2(kovanProtocolDataProvider, reservesV2[0], deployer);
  console.log(`user reserve data: ${userData}`);
  reserveData = await fetchDataWrapper.getReservesConfigurationData(kovanProtocolDataProvider, false, [reservesV2[0]]);
  console.log(`reserve config data: ${reserveData}`);
  reserveData = await fetchDataWrapper.getReservesData(kovanProtocolDataProvider, false, [reservesV2[0]]);
  console.log(`reserve data: ${reserveData}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
