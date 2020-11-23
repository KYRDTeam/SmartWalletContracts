#!/bin/sh
ALL=true

while getopts "f:" arg; do
  case $arg in
    f) FILE=$OPTARG;;
  esac
done

if [ -n "$FILE" ]; then
  yarn hardhat test --no-compile --network develop $FILE
else
  echo "Running all tests..."
  yarn hardhat test --no-compile --network develop
fi
