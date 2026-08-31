#!/bin/bash

# Exit on any error
set -e

# Configuration
REPO_URL="https://github.com/r3t4rd/chibimadness.git" # Change to git@github.com:r3t4rd/chibimadness.git if using SSH keys
SERVER_DIR="/home/dash/chibimadness-server/chibimadness-server"
BIN_DIR="/home/dash/chibimadness-server/bin"
PM2_APP="6" # or "chibimadness-server"

echo "=== [1/4] Downloading latest server source code ==="

# Create temporary directory for cloning
TEMP_DIR=$(mktemp -d)
echo "Created temp directory: $TEMP_DIR"

# Perform sparse clone (downloading only metadata and server folder to save bandwidth)
echo "Cloning repository..."
git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TEMP_DIR"

cd "$TEMP_DIR"
echo "Downloading only 'server' directory..."
git sparse-checkout set server

# Update target server directory with downloaded files
echo "Syncing files to $SERVER_DIR..."
mkdir -p "$SERVER_DIR"
if command -v rsync >/dev/null 2>&1; then
    rsync -av --delete "$TEMP_DIR/server/" "$SERVER_DIR/"
else
    # Fallback to rm + cp if rsync is not installed
    rm -rf "${SERVER_DIR:?}"/*
    cp -rp "$TEMP_DIR/server/"* "$SERVER_DIR/"
fi

# Clean up temporary directory
rm -rf "$TEMP_DIR"

echo "=== [2/4] Building Rust server ==="
cd "$SERVER_DIR"
if [ -f "Cargo.toml" ]; then
    cargo build --release
    BUILD_PATH="target/release/chibimadness-server"
else
    echo "Error: Cargo.toml not found!"
    exit 1
fi

echo "=== [3/4] Copying binary ==="
if [ -f "$BUILD_PATH" ]; then
    mkdir -p "$BIN_DIR"
    cp "$BUILD_PATH" "$BIN_DIR/chibimadness-server"
    echo "Binary successfully copied to $BIN_DIR/chibimadness-server"
else
    echo "Error: Compiled binary not found at $BUILD_PATH"
    exit 1
fi

echo "=== [4/4] Restarting PM2 process ==="
pm2 restart "$PM2_APP" --update-env

echo "=== Deployment completed successfully! ==="
