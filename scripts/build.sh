#! /usr/bin/env bash

bun --filter='tildagon-app-directory-api' run dev &

sleep 5

# DIRECTORY_PID=$(cat .server.pid)
# echo $DIRECTORY_PID

curl http://localhost:3000/v1/apps

bun --filter='tildagon-app-directory-site' run build

# pkill -P $$

# echo $$
# sleep 10
# pkill -P $$
# sleep 50

# kill $DIRECTORY_PID
# rm .server.pid

kill $(pidof bun)
