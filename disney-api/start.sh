#!/bin/sh
# ============================================================
# Docker entrypoint: starts the API server and wait-time
# collector as concurrent background processes.
# ============================================================

echo "🚀 Starting Disney API server..."
node server.js &

echo "⏱  Starting wait time collector..."
node wait-collector.js &

# Wait for either process to exit (if one crashes, container restarts)
wait -n
echo "⚠️  A process exited — container will restart."
exit 1
