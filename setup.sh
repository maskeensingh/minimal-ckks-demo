#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

SEAL_VERSION="3.6.5"
DEPS_DIR="$PWD/.deps"
SOURCE_DIR="$DEPS_DIR/SEAL"
INSTALL_DIR="$DEPS_DIR/install"

if [ -f "$INSTALL_DIR/lib/cmake/SEAL-3.6/SEALConfig.cmake" ] || [ -f "$INSTALL_DIR/lib64/cmake/SEAL-3.6/SEALConfig.cmake" ]; then
  echo "Microsoft SEAL already installed in $INSTALL_DIR"
  exit 0
fi

mkdir -p "$DEPS_DIR"
if [ ! -d "$SOURCE_DIR/.git" ]; then
  git clone --depth 1 --branch "v$SEAL_VERSION" https://github.com/microsoft/SEAL.git "$SOURCE_DIR"
fi
cmake -S "$SOURCE_DIR" -B "$DEPS_DIR/seal-build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$INSTALL_DIR" \
  -DCMAKE_INSTALL_LIBDIR=lib \
  -DSEAL_BUILD_DEPS=OFF \
  -DSEAL_BUILD_EXAMPLES=OFF \
  -DSEAL_BUILD_TESTS=OFF \
  -DSEAL_BUILD_BENCH=OFF \
  -DSEAL_USE_MSGSL=OFF \
  -DSEAL_USE_ZLIB=OFF \
  -DSEAL_USE_ZSTD=OFF
cmake --build "$DEPS_DIR/seal-build" --config Release -j 4
cmake --install "$DEPS_DIR/seal-build" --config Release
echo "Microsoft SEAL $SEAL_VERSION installed in $INSTALL_DIR"
