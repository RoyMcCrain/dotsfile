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

# git diffを取得
DIFF=$(git diff --cached)

if [ -z "$DIFF" ]; then
    if [ "$MESSAGE_ONLY" = true ]; then
        echo "Error: No staged changes" >&2
    else
        echo -e "${YELLOW}ステージングされた変更がありません${NC}"
    fi
    exit 1
fi

# メッセージのみモードでない場合のみ表示
if [ "$MESSAGE_ONLY" = false ]; then
    echo -e "${GREEN}LM Studioでコミットメッセージを生成中...${NC}"
fi

# JSONデータを作成
JSON_PAYLOAD=$(jq -n \
  --arg diff "$DIFF" \
  '{
    model: "qwen/qwen3-8b",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant that generates git commit messages. Use conventional commits format (feat:, fix:, docs:, style:, refactor:, test:, chore:). For simple changes, use a single line. For complex changes, use a subject line followed by a blank line and a detailed body explaining what and why. Be specific and clear."
      },
      {
        role: "user",
        content: ("Generate a commit message for these changes:\n\n" + $diff)
      }
    ],
    temperature: 0.5,
    max_tokens: 80
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
