#!/usr/bin/env bash

bun --filter='tildagon-app' run build

npm --workspace=tildagon-app-directory-site run build
