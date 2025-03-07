#!/bin/bash

set -euo pipefail

show_help() {
  echo "🚀 修正版分割ツール 🚀"
  echo "使用方法: $0 [-n 分割数] 入力ファイル"
  exit 1
}

# ヘルプオプションのチェック
for arg in "$@"; do
  if [[ "$arg" == "-h" || "$arg" == "--help" ]]; then
    show_help
  fi
done

# デフォルト値
SPLIT_NUM=2

while getopts "n:h" OPT; do
  case $OPT in
    n) SPLIT_NUM=$OPTARG ;;
    h) show_help ;;
    \?) echo "無効なオプション: -$OPTARG" >&2; exit 1 ;;
  esac
done
shift $((OPTIND -1))

INPUT_FILE="${1:-}"
if [[ -z "$INPUT_FILE" ]]; then
  echo "❌ 入力ファイルを指定してください！"
  show_help
fi

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "🔥 ファイルが見つかりません: $INPUT_FILE"
  exit 1
fi

# プレフィックス生成
SAFE_NAME=$(basename "$INPUT_FILE" | LC_ALL=C sed -E 's/\.[^.]*$//; s/[^a-zA-Z0-9]/_/g')
PREFIX="${SAFE_NAME}_"

# サフィックス設定
SUFFIX_LENGTH=$(printf "%d" "$SPLIT_NUM" | wc -c)
export SUFFIX_LENGTH
export PREFIX
export SPLIT_NUM

echo "🔄 分割処理を開始..."
split -d -a "$SUFFIX_LENGTH" -n "$SPLIT_NUM" "$INPUT_FILE" "${PREFIX}tmp_" \
  --additional-suffix=.txt \
  --filter='
    echo "=== フィルタ処理開始: $FILE ===" >&2
    
    # 元の番号抽出（正規表現修正）
    ORIGINAL_NUM=$(basename "$FILE" | grep -oE "[0-9]+" | tail -1)
    echo "抽出番号: $ORIGINAL_NUM" >&2
    
    CURRENT_NUM=$((ORIGINAL_NUM + 1))
    PAD_NUM=$(printf "%0${SUFFIX_LENGTH}d" $CURRENT_NUM)
    NEW_NAME="${PREFIX}${PAD_NUM}.txt"
    echo "新しいファイル名: $NEW_NAME" >&2

    TOTAL=$SPLIT_NUM
    PREV_NUM=$((CURRENT_NUM - 1))
    NEXT_NUM=$((CURRENT_NUM + 1))

    # メタデータ生成
    {
      echo "---"
      echo "part_number: $CURRENT_NUM/$TOTAL"
      [ $PREV_NUM -ge 1 ] && echo "previous_file: ${PREFIX}$(printf "%0${SUFFIX_LENGTH}d" $PREV_NUM).txt"
      [ $NEXT_NUM -le $TOTAL ] && echo "next_file: ${PREFIX}$(printf "%0${SUFFIX_LENGTH}d" $NEXT_NUM).txt"
      echo "---"
      cat
    } > "$NEW_NAME"

    # 元ファイルの削除（存在確認追加）
    if [[ -f "$FILE" ]]; then
      rm "$FILE"
      echo "一時ファイル削除: $FILE" >&2
    fi
  '

echo "✅ 完了！生成ファイルリスト:"
ls -1v "${PREFIX}"*.txt | awk '{printf "  %02d: %s\n", NR, $0}'

