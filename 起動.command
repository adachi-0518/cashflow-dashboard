#!/bin/zsh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "資金繰りダッシュボードの開発サーバーを起動します..."
echo ""
echo "ブラウザで http://localhost:5173 を開いてください。"
echo "終了するときは、このウィンドウで Ctrl+C を押します。"
echo ""

npm run dev
