#!/bin/bash

# Exit on any error
set -e

# Configuration
SERVER_DIR="/home/dash/chibimadness-server/chibimadness-server"
BIN_DIR="/home/dash/chibimadness-server/bin"
PM2_APP="6" # or "chibimadness-server"

echo "=== [1/4] Updating repository ==="
if [ -d "$SERVER_DIR" ]; then
    cd "$SERVER_DIR"
else
    echo "Directory $SERVER_DIR not found!"
    exit 1
fi

# Pull changes
if [ -d ".git" ] || git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Pulling latest code..."
    git pull
else
    echo "Not a git repository, skipping git pull (or update files manually)."
fi

echo "=== [2/4] Building Rust server ==="
# Check if Cargo.toml is in the current directory or a subdirectory
if [ -f "Cargo.toml" ]; then
    cargo build --release
    BUILD_PATH="target/release/chibimadness-server"
elif [ -f "server/Cargo.toml" ]; then
    cd server
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
