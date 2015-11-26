#!/usr/bin/env bash
set -e

BRANCH=$(git branch | awk '/^\*/{print $2}')

if [[ "$BRANCH" != "master" ]]; then
  echo "Cannot push non-master branch!"
  exit 1
fi

# bash test.sh

NEW_VERSION=$(node bumpVersions.js $1)

echo "=> Deploying $NEW_VERSION..."


git add .
git commit -m "Deploying version $NEW_VERSION"
git push origin master
git tag v$NEW_VERSION
git push origin --tags

cd packages/emissary && meteor publish && cd ../../
cd packages/mandrill && meteor publish && cd ../../
cd packages/router && meteor publish && cd ../../
cd packages/twilio && meteor publish && cd ../../
cd packages/webhook && meteor publish && cd ../../
cd packages/push && meteor publish && cd ../../
