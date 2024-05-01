#! /usr/bin/env bash

npm run --workspace tildagon-app-directory-api dev &

sleep 5

# DIRECTORY_PID=$(cat .server.pid)
# echo $DIRECTORY_PID

curl http://localhost:3000/v1/apps

npm run --workspace tildagon-app-directory-site build

# pkill -P $$

# echo $$
# sleep 10
# pkill -P $$
# sleep 50

# kill $DIRECTORY_PID
# rm .server.pid
tar -cvzf github-pages.tar.gz -C ./packages/tildagon-app-directory-site/dist .

kill $(pidof bun)
