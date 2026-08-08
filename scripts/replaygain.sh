#!/bin/bash

set -euo pipefail

show_help() {
  echo "🎚️  ReplayGain付与ツール 🎚️"
  echo "使用方法: $0 [rsgainオプション]"
  echo "rsgainを使用して、カレントディレクトリのFLACファイルにReplayGainタグを付与します"
  echo "並列数はCPUコア数をデフォルトで使用します（-mで上書き可能）"
  exit 1
}

# rsgain存在チェック
if ! command -v rsgain >/dev/null 2>&1; then
  echo "エラー: rsgainがインストールされていません" >&2
  exit 1
fi

# ヘルプオプションのチェック
for arg in "$@"; do
  if [[ "$arg" == "-h" || "$arg" == "--help" ]]; then
    show_help
  fi
done

rsgain easy -m "$(nproc)" "$@" .
