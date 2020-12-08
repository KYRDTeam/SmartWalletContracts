'use strict';
const fs = require('fs');
const util = require('util');
const got = require('got');
const yargs = require('yargs');

let path = 'artifacts/contracts';

const readdir = util.promisify(fs.readdir);

async function getFiles(dir, files_, names_){
  var files = await readdir(dir);
  for (var i in files){
      var fullDir = dir + '/' + files[i];
      if (fs.statSync(fullDir).isDirectory()){
          await getFiles(fullDir, files_, names_);
      } else {
          files_.push(fullDir);
          names_.push(files[i]);
      }
  }
  return (files_, names_);
}


async function generateCodeSizeReport() {
  let result = {};
  let fileDirs = [];
  let fileNames = [];
  await getFiles(path, fileDirs, fileNames);

  for (let i = 0; i < fileDirs.length; i++) {
    let fileDir = fileDirs[i];
    let rawData = fs.readFileSync(fileDir);
    let contractData = JSON.parse(rawData);
    if (contractData.deployedBytecode != undefined) {
      let codeSize = contractData.deployedBytecode.length / 2 - 1;
      if (codeSize > 0) {
        result[fileNames[i]] = codeSize;
      }
    }
  }
  return result;
}

async function writeReport(report) {
  let jsonContent = JSON.stringify(report, null, '\t');
  let reportDir = `report/`;
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, {recursive: true});
  }
  let reportFile = `${reportDir}contractSize.json`;
  fs.writeFile(reportFile, jsonContent, 'utf8', function (err) {
    if (err) {
      console.log('An error occured while writing JSON Object to File.');
      return console.log(err);
    }
  });
  console.table(report);
}

async function printContractSize() {
  let contractSizeReport = await generateCodeSizeReport();
  await writeReport(contractSizeReport);
  
}

printContractSize();
