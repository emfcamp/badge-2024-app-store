#!/bin/bash

function __show_help() {
  echo "Container entrypoint commands:"
  echo "  help - show this help"
  echo ""
  echo "Any other command will be executed within the container."
}

case ${1} in
help)
  __show_help
  ;;

*)
  exec "$@"
  ;;
esac
