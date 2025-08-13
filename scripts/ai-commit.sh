#!/bin/bash
# ~/.local/bin/ai-commit

# オプション解析
MESSAGE_ONLY=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --message-only|-m)
      MESSAGE_ONLY=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# カラー設定
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 設定値
MAX_LINES=500
CONTEXT_LINES=1

# git diffを取得（コンテキスト行を制限）
DIFF=$(git diff --cached -U${CONTEXT_LINES})

if [ -z "$DIFF" ]; then
    if [ "$MESSAGE_ONLY" = true ]; then
        echo "Error: No staged changes" >&2
    else
        echo -e "${YELLOW}ステージングされた変更がありません${NC}"
    fi
    exit 1
fi

# diffの行数をチェック
DIFF_LINES=$(echo "$DIFF" | wc -l)

# diffが大きすぎる場合は要約
if [ "$DIFF_LINES" -gt "$MAX_LINES" ]; then
    if [ "$MESSAGE_ONLY" = false ]; then
        echo -e "${YELLOW}Diffが大きすぎます（${DIFF_LINES}行）。要約を生成します...${NC}"
    fi
    
    # ファイルごとの変更統計を取得
    STATS=$(git diff --cached --stat)
    
    # 変更されたファイルリスト
    FILES=$(git diff --cached --name-status)
    
    # 主要な変更部分のみを抽出（最初と最後の一部）
    HEAD_DIFF=$(echo "$DIFF" | head -n 100)
    TAIL_DIFF=$(echo "$DIFF" | tail -n 100)
    
    # 要約版のdiffを作成
    DIFF="Summary of large diff (${DIFF_LINES} lines):

File Changes:
${FILES}

Statistics:
${STATS}

--- First 100 lines of diff ---
${HEAD_DIFF}

--- Last 100 lines of diff ---
${TAIL_DIFF}"
fi

# メッセージのみモードでない場合のみ表示
if [ "$MESSAGE_ONLY" = false ]; then
    echo -e "${GREEN}LM Studioでコミットメッセージを生成中...${NC}"
fi

# JSONデータを作成
JSON_PAYLOAD=$(jq -n \
  --arg diff "$DIFF" \
  '{
    model: "google/gemma-3-12b",
    messages: [
      {
        role: "system",
        content: "You are a git commit message generator. Generate ONLY the commit message text using conventional commits format (feat/fix/docs/style/refactor/test/chore). Do not include any explanations, markdown formatting, code blocks, or additional text. Output the raw commit message only. Subject line must be under 50 chars. Add body only if needed, wrapped at 72 chars. Never add text like \"Here is the commit message:\" or \"Commit message:\". Start directly with the commit type."
      },
      {
        role: "user",
        content: ("Generate a commit message for these changes:\n\n" + $diff)
      }
    ],
    temperature: 0.8,
    max_tokens: 100
  }')

# LM Studioに問い合わせ
RESPONSE=$(curl -s -X POST http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")

# メッセージを抽出
MESSAGE=$(echo "$RESPONSE" | jq -r '.choices[0].message.content // empty' 2>/dev/null)

if [ -z "$MESSAGE" ]; then
    if [ "$MESSAGE_ONLY" = true ]; then
        echo "Error: Failed to generate message" >&2
        echo "$RESPONSE" >&2
    else
        echo -e "${RED}エラー: メッセージ生成に失敗しました${NC}"
        echo "レスポンス: $RESPONSE"
    fi
    exit 1
fi

# メッセージのみモードの場合
if [ "$MESSAGE_ONLY" = true ]; then
    echo "$MESSAGE"
    exit 0
fi

# 通常モードの場合
echo -e "\n${GREEN}生成されたメッセージ:${NC}"
echo "$MESSAGE"
echo -e "\n使用する？ (y/n/e[dit]): \c"
read -r answer

case "$answer" in
    y|Y)
        git commit -m "$MESSAGE"
        echo -e "${GREEN}コミット完了${NC}"
        ;;
    e|E)
        git commit -e -m "$MESSAGE"
        ;;
    *)
        echo "キャンセル"
        ;;
esac
