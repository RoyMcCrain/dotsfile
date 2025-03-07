#!/bin/bash

set -euo pipefail

show_help() {
  echo "🚀 ハイレゾの最適化ツール 🚀"
  echo "使用方法: $0 対象ファイル"
  echo "ffmpegを使用して、ハイレゾのFLACファイルを24bit/48kHzに変換します"
  exit 1
}

# FFmpeg存在チェック（シンプル版）
if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "エラー: ffmpegがインストールされていません" >&2
    exit 1
fi

# ヘルプオプションのチェック
for arg in "$@"; do
  if [[ "$arg" == "-h" || "$arg" == "--help" ]]; then
    show_help
  fi
done

for file in *.flac; do
  ffmpeg -i "$file" -c:a flac -sample_fmt s32 -ar 48000 -bits_per_raw_sample 24 "${file%.*}_24bit_48kHz.flac"
done

# 元のファイルを削除
for file in *.flac; do
  if [[ $file != *_24bit_48kHz.flac ]]; then
    rm "$file"
  fi
done

for file in *.flac; do
  # _24bit_48kHzを削除してリネーム
  if [[ $file == *_24bit_48kHz.flac ]]; then
    newname="${file/_24bit_48kHz/}"
    mv "$file" "$newname"
  fi
done
