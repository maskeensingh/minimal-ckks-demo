#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
bash setup.sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
  -DSEAL_DIR="$PWD/.deps/install/lib/cmake/SEAL-3.6"
cmake --build build --config Release -j 4
exec python3 app.py
