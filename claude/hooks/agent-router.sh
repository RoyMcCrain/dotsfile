#!/bin/bash
# ユーザー入力を分析して適切なエージェントを提案

input=$(cat)
prompt=$(echo "$input" | jq -r '.prompt // ""' | tr '[:upper:]' '[:lower:]')

# キーワードチェック
if echo "$prompt" | grep -qE 'レビュー|review|設計|design|バグ|bug|デバッグ|debug|アーキテクチャ'; then
  echo '{"continue":true,"message":"[Agent提案] Codexが得意な領域です。/codex-review または /codex-design を検討してください。"}'
elif echo "$prompt" | grep -qE '調査|research|リサーチ|ドキュメント|比較|最新|トレンド'; then
  echo '{"continue":true,"message":"[Agent提案] Geminiが得意な領域です。/gemini-research を検討してください。"}'
else
  echo '{"continue":true}'
fi
