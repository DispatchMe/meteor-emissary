#!/usr/bin/env bash
set -e

jshint .


runTestsFor() {
  echo "Running tests for $1"
  VELOCITY_TEST_PACKAGES=1 PACKAGE_DIRS=./packages meteor test-packages --driver-package velocity:html-reporter --velocity ./packages/$1
}

runTestsFor "emissary"
runTestsFor "mandrill"
runTestsFor "router"
runTestsFor "twilio"
runTestsFor "webhook"
