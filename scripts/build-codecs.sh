#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPS_DIR="${DEPS_DIR:-$ROOT_DIR/.codec-build/deps}"
BUILD_DIR="$ROOT_DIR/.codec-build/wasm"
mkdir -p "$DEPS_DIR" "$ROOT_DIR/public/codecs" "$ROOT_DIR/public/licenses"
if [ ! -d "$DEPS_DIR/jxrlib" ]; then
  git clone https://github.com/4creators/jxrlib.git "$DEPS_DIR/jxrlib"
  git -C "$DEPS_DIR/jxrlib" checkout f7521879862b9085318e814c6157490dd9dbbdb4
fi
if [ ! -d "$DEPS_DIR/libultrahdr" ]; then
  git clone --depth 1 --branch v1.4.0 https://github.com/google/libultrahdr.git "$DEPS_DIR/libultrahdr"
fi
emcmake cmake -S "$ROOT_DIR/native" -B "$BUILD_DIR" -DCMAKE_BUILD_TYPE=Release -DDEPS_DIR="$DEPS_DIR"
cmake --build "$BUILD_DIR" --parallel 4 --target codecs
cp "$BUILD_DIR/codecs.mjs" "$BUILD_DIR/codecs.wasm" "$ROOT_DIR/public/codecs/"
cp "$DEPS_DIR/jxrlib/LICENSE" "$ROOT_DIR/public/licenses/jxrlib.txt"
cp "$DEPS_DIR/libultrahdr/LICENSE" "$ROOT_DIR/public/licenses/libultrahdr.txt"
cp "$DEPS_DIR/libultrahdr/third_party/turbojpeg/LICENSE.md" "$ROOT_DIR/public/licenses/libjpeg-turbo.txt"
cp "$DEPS_DIR/libultrahdr/third_party/turbojpeg/README.ijg" "$ROOT_DIR/public/licenses/libjpeg-ijg.txt"
sha256sum "$ROOT_DIR/public/codecs/codecs.wasm"
