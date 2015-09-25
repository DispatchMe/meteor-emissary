#!/usr/bin/env bash
set -e

jshint .


runTestsFor() {
  echo "Running tests for $1"
  PACKAGE_DIRS=./packages velocity test-package packages/$1 --ci --release METEOR@1.2.0.1
  echo "------------------"
}

runTestsFor "emissary"
runTestsFor "mandrill"
runTestsFor "router"
runTestsFor "twilio"
runTestsFor "webhook"
