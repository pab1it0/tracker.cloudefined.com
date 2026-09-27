#!/usr/bin/env bash
# Idempotently starts a local mongo:8 container for dev, bound to 127.0.0.1:27018.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
CONTAINER_NAME="tracker-mongo"
PORT=27018

touch "$ENV_FILE"

if ! grep -q '^MONGODB_ADMIN_URI=' "$ENV_FILE" 2>/dev/null; then
  ROOT_PASSWORD="$(openssl rand -hex 16)"
  echo "MONGODB_ADMIN_URI=mongodb://root:${ROOT_PASSWORD}@127.0.0.1:${PORT}/?authSource=admin" >> "$ENV_FILE"
  echo "Generated a new root password for $CONTAINER_NAME (see MONGODB_ADMIN_URI in .env.local)."
else
  ROOT_PASSWORD="$(sed -n 's/^MONGODB_ADMIN_URI=mongodb:\/\/root:\([^@]*\)@.*/\1/p' "$ENV_FILE" | head -1)"
fi

if [ -z "${ROOT_PASSWORD:-}" ]; then
  echo "Could not determine root password from .env.local — check MONGODB_ADMIN_URI there." >&2
  exit 1
fi

if [ "$(docker ps -aq -f name="^${CONTAINER_NAME}\$")" = "" ]; then
  echo "Creating container $CONTAINER_NAME..."
  docker run -d \
    --name "$CONTAINER_NAME" \
    -p "127.0.0.1:${PORT}:27017" \
    -e MONGO_INITDB_ROOT_USERNAME=root \
    -e MONGO_INITDB_ROOT_PASSWORD="$ROOT_PASSWORD" \
    mongo:8 >/dev/null
elif [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null)" != "true" ]; then
  echo "Starting existing container $CONTAINER_NAME..."
  docker start "$CONTAINER_NAME" >/dev/null
else
  echo "$CONTAINER_NAME already running."
fi

echo "Waiting for mongo to answer ping..."
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_NAME" mongosh --quiet --eval 'db.runCommand({ping:1})' \
      -u root -p "$ROOT_PASSWORD" --authenticationDatabase admin >/dev/null 2>&1; then
    echo "Mongo is up on 127.0.0.1:${PORT}. Admin URI is in .env.local (MONGODB_ADMIN_URI)."
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for mongo to respond." >&2
exit 1
