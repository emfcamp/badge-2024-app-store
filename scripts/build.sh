#!/usr/bin/env bash

export APP_STORE_MOCK=true

bun --filter='tildagon-app' run build

bun --filter='tildagon-app-directory-api' run dev &

sleep 5

# DIRECTORY_PID=$(cat .server.pid)
# echo $DIRECTORY_PID

curl -s http://localhost:3000/v1/apps

exit_status=$?
if [ $exit_status != 0 ]; then
  exit $exit_status
fi

bun --filter='tildagon-app-directory-site' run build
BUILD_STATUS=$?

# pkill -P $$

# echo $$
# sleep 10
# pkill -P $$
# sleep 50

# kill $DIRECTORY_PID
# rm .server.pid

kill "$(pidof bun)"

exit "$BUILD_STATUS"
