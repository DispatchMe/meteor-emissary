#!/bin/bash

PACKAGE_DIRS=./packages velocity test-package packages/push --port 5000 --driver-package=velocity:html-reporter@0.9.0-rc.1 --release METEOR@1.2.0.1
