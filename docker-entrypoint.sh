#!/usr/bin/env sh
set -eu

case "${TASKBOARDS_DEBUG:-}" in
  1|true|TRUE|yes|YES|on|ON|debug|DEBUG)
    export PORT="${API_PORT:-3000}"
    exec npm run dev
    ;;
  *)
    export NODE_ENV=production
    export PORT="${PORT:-8142}"
    npm run build
    exec npm run start
    ;;
esac
