#!/bin/bash
# ~/.local/bin/ai-commit

# カラー設定
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# git diffを取得
DIFF=$(git diff --cached)

if [ -z "$DIFF" ]; then
    echo -e "${YELLOW}ステージングされた変更がありません${NC}"
    exit 1
fi

echo -e "${GREEN}LM Studioでコミットメッセージを生成中...${NC}"

# JSONデータを作成（エスケープ処理を改善）
JSON_PAYLOAD=$(jq -n \
  --arg diff "$DIFF" \
  '{
    model: "google/gemma-3-12b",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant that generates concise git commit messages in English only. Use conventional commits format when appropriate (feat:, fix:, docs:, style:, refactor:, test:, chore:). Be specific and clear. Never include translations."
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
    echo -e "${RED}エラー: メッセージ生成に失敗しました${NC}"
    echo "レスポンス: $RESPONSE"
    
    # より詳しいエラー情報
    ERROR=$(echo "$RESPONSE" | jq -r '.error.message // empty' 2>/dev/null)
    if [ -n "$ERROR" ]; then
        echo -e "${RED}エラー詳細: $ERROR${NC}"
    fi
    exit 1
fi

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
