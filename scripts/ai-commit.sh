#!/bin/bash
# ~/.local/bin/ai-commit

# オプション解析
MESSAGE_ONLY=false
THINK_MODEL=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --message-only|-m)
      MESSAGE_ONLY=true
      shift
      ;;
    --think|-t)
      THINK_MODEL=true
      shift
      ;;
    --help|-h)
      echo "Usage: ai-commit [options]"
      echo ""
      echo "Options:"
      echo "  --think, -t     大きいモデル (qwen3.5-35b-a3b) で分析"
      echo "  --message-only, -m  メッセージのみ出力（対話なし）"
      echo "  --help, -h      このヘルプを表示"
      echo ""
      echo "Environment:"
      echo "  AI_COMMIT_MODEL       デフォルトモデル (default: qwen3.5-9b)"
      echo "  AI_COMMIT_MODEL_THINK  --think時のモデル (default: qwen3.5-35b-a3b)"
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

# リポジトリタイプの検出（jj優先）
if [ -d ".jj" ]; then
    REPO_TYPE="jj"
elif [ -d ".git" ]; then
    REPO_TYPE="git"
else
    echo "Error: Not a git or jj repository" >&2
    exit 1
fi

# LM Studioのヘルスチェック（早期失敗）
if ! curl -s --connect-timeout 1 --max-time 2 http://localhost:1234/v1/models >/dev/null 2>&1; then
    if [ "$MESSAGE_ONLY" = true ]; then
        echo "Error: LM Studio is not running on port 1234" >&2
    else
        echo -e "\033[0;31mエラー: LM Studioがポート1234で起動していません\033[0m"
        echo "LM Studioを起動してから再度実行してください"
    fi
    exit 1
fi

# カラー設定
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# 設定値（環境変数でオーバーライド可能）
MAX_LINES=${AI_COMMIT_MAX_LINES:-100}
CONTEXT_LINES=${AI_COMMIT_CONTEXT:-0}
MAX_TOKENS=${AI_COMMIT_MAX_TOKENS:-1000}
CHARS_PER_TOKEN=${AI_COMMIT_CHARS_PER_TOKEN:-4}
if [ "$THINK_MODEL" = true ]; then
    MODEL=${AI_COMMIT_MODEL_THINK:-"qwen3.5-35b-a3b"}
else
    MODEL=${AI_COMMIT_MODEL:-"qwen3.5-9b"}
fi

# diffを取得（リポジトリタイプに応じて）
if [ "$REPO_TYPE" = "jj" ]; then
    DIFF=$(jj diff --context ${CONTEXT_LINES})
    STATUS=$(jj diff --summary)
else
    DIFF=$(git diff --cached -U${CONTEXT_LINES})
    STATUS=$(git diff --cached --name-status)
fi

if [ -z "$DIFF" ]; then
    if [ "$MESSAGE_ONLY" = true ]; then
        echo "Error: No changes" >&2
    else
        echo -e "${YELLOW}変更がありません${NC}"
    fi
    exit 1
fi

# diffの行数とトークン数を推定
DIFF_LINES=$(echo "$DIFF" | wc -l)
DIFF_CHARS=$(echo "$DIFF" | wc -c)
ESTIMATED_TOKENS=$((DIFF_CHARS / CHARS_PER_TOKEN))

# トークン数またはライン数が多い場合は要約
if [ "$ESTIMATED_TOKENS" -gt "$MAX_TOKENS" ] || [ "$DIFF_LINES" -gt "$MAX_LINES" ]; then
    if [ "$MESSAGE_ONLY" = false ]; then
        echo -e "${YELLOW}Diffが大きいため要約します（推定${ESTIMATED_TOKENS}トークン、${DIFF_LINES}行）${NC}"
    fi

    if [ "$REPO_TYPE" = "jj" ]; then
        STATS=$(jj diff --stat)
    else
        STATS=$(git diff --cached --stat)
    fi

    if [ "$ESTIMATED_TOKENS" -gt $((MAX_TOKENS * 2)) ]; then
        EXTRACT_LINES=20
    elif [ "$ESTIMATED_TOKENS" -gt "$MAX_TOKENS" ]; then
        EXTRACT_LINES=30
    else
        EXTRACT_LINES=50
    fi

    HEAD_DIFF=$(echo "$DIFF" | head -n $EXTRACT_LINES)
    TAIL_DIFF=$(echo "$DIFF" | tail -n $EXTRACT_LINES)

    DIFF="Summary of large diff (${ESTIMATED_TOKENS} tokens, ${DIFF_LINES} lines):

File Changes:
${STATUS}

Statistics:
${STATS}

--- First ${EXTRACT_LINES} lines of diff ---
${HEAD_DIFF}

--- Last ${EXTRACT_LINES} lines of diff ---
${TAIL_DIFF}"
fi

if [ "$MESSAGE_ONLY" = false ]; then
    echo -e "${GREEN}LM Studioで変更を分析中...${NC}"
fi

# システムプロンプト: JSON出力で分類+メッセージ+分割提案
SYSTEM_PROMPT='You are a commit analyzer. Analyze the given diff and file changes, then output ONLY valid JSON (no markdown, no explanation, no thinking tags).

Output format:
{
  "files": [
    {"file": "path/to/file", "type": "feat|fix|refactor|docs|chore|test", "desc": "short description"}
  ],
  "should_split": true or false,
  "groups": [
    {
      "message": "type: commit message under 50 chars",
      "files": ["path/to/file1", "path/to/file2"]
    }
  ]
}

Rules:
- If all changes share one purpose, set should_split=false and put one entry in groups
- If changes have different purposes, set should_split=true and create multiple groups
- Each group.message uses conventional commits format (feat/fix/docs/refactor/test/chore)
- Keep messages concise, under 50 chars
- Output ONLY the JSON object, nothing else'

USER_PROMPT="Analyze these changes:

File list:
${STATUS}

Diff:
${DIFF}"

JSON_PAYLOAD=$(jq -n \
  --arg model "$MODEL" \
  --arg system "$SYSTEM_PROMPT" \
  --arg user "$USER_PROMPT" \
  '{
    model: $model,
    messages: [
      { role: "system", content: $system },
      { role: "user", content: $user }
    ],
    temperature: 0.3,
    max_tokens: 2000,
    stream: false
  }')

RESPONSE=$(curl -s -X POST http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")

# レスポンスからコンテンツを抽出
RAW_CONTENT=$(echo "$RESPONSE" | jq -r '
  def to_text:
    if . == null then ""
    elif type == "string" then .
    elif type == "array" then map(to_text) | join("")
    elif type == "object" then (.text // .string // .value // "") | to_text
    else ""
    end;
  (.choices[0].message.content // empty) | to_text
' 2>/dev/null)

# <think>タグを除去（複数行対応）
RAW_CONTENT=$(echo "$RAW_CONTENT" | perl -0pe 's/<think>.*?<\/think>//gs' | sed '/^$/d')

# JSONブロックを抽出（```json ... ``` や生JSONに対応）
JSON_CONTENT=$(echo "$RAW_CONTENT" | sed -n '/^```json/,/^```$/p' | sed '1d;$d')
if [ -z "$JSON_CONTENT" ]; then
    JSON_CONTENT=$(echo "$RAW_CONTENT" | sed -n '/^```/,/^```$/p' | sed '1d;$d')
fi
if [ -z "$JSON_CONTENT" ]; then
    JSON_CONTENT="$RAW_CONTENT"
fi

# JSONとしてパースできるか検証
if ! echo "$JSON_CONTENT" | jq . >/dev/null 2>&1; then
    if [ "$MESSAGE_ONLY" = true ]; then
        echo "Error: Failed to parse AI response as JSON" >&2
        echo "$RAW_CONTENT" >&2
    else
        echo -e "${RED}エラー: AI応答のJSONパースに失敗しました${NC}"
        echo -e "${YELLOW}生の応答:${NC}"
        echo "$RAW_CONTENT"
        echo ""
        echo -e "従来のコミットメッセージ生成にフォールバックしますか？ (y/n): \c"
        read -r fallback
        if [ "$fallback" = "y" ] || [ "$fallback" = "Y" ]; then
            # 従来方式: シンプルなメッセージ生成
            SIMPLE_PAYLOAD=$(jq -n \
              --arg model "$MODEL" \
              --arg system "You are a git commit message generator. Generate ONLY the commit message text using conventional commits format. NEVER use thinking tags. Output the raw commit message only. Subject line must be under 50 chars." \
              --arg user "Generate a commit message for these changes: $DIFF" \
              '{
                model: $model,
                messages: [
                  { role: "system", content: $system },
                  { role: "user", content: $user }
                ],
                temperature: 0.5,
                max_tokens: 100,
                stream: false
              }')
            SIMPLE_RESP=$(curl -s -X POST http://localhost:1234/v1/chat/completions \
              -H "Content-Type: application/json" \
              -d "$SIMPLE_PAYLOAD")
            MESSAGE=$(echo "$SIMPLE_RESP" | jq -r '.choices[0].message.content // empty' 2>/dev/null)
            MESSAGE=$(echo "$MESSAGE" | sed 's/<think>.*<\/think>//g' | sed '/^$/d')
            if [ -n "$MESSAGE" ]; then
                echo -e "\n${GREEN}生成されたメッセージ:${NC}"
                echo "$MESSAGE"
                echo -e "\n使用する？ (y/n/e[dit]): \c"
                read -r answer
                case "$answer" in
                    y|Y)
                        if [ "$REPO_TYPE" = "jj" ]; then
                            jj describe -m "$MESSAGE"
                            echo -e "${GREEN}describe完了${NC}"
                        else
                            git commit -m "$MESSAGE"
                            echo -e "${GREEN}コミット完了${NC}"
                        fi
                        ;;
                    e|E)
                        if [ "$REPO_TYPE" = "jj" ]; then jj describe; else git commit -e -m "$MESSAGE"; fi
                        ;;
                    *) echo "キャンセル" ;;
                esac
            else
                echo -e "${RED}フォールバックも失敗しました${NC}"
            fi
        fi
    fi
    exit 1
fi

# --- JSON パース成功 ---

SHOULD_SPLIT=$(echo "$JSON_CONTENT" | jq -r '.should_split')
NUM_GROUPS=$(echo "$JSON_CONTENT" | jq '.groups | length')

# メッセージのみモード
if [ "$MESSAGE_ONLY" = true ]; then
    if [ "$SHOULD_SPLIT" = "true" ]; then
        echo "$JSON_CONTENT" | jq -r '.groups[0].message'
    else
        echo "$JSON_CONTENT" | jq -r '.groups[0].message'
    fi
    exit 0
fi

# --- 変更の分類テーブルを表示 ---
echo ""
echo -e "${BOLD}変更の分類:${NC}"
echo "┌────────────┬────────────────────────────────────────────┬──────────────────────────────────┐"
echo "│ 分類       │ ファイル                                   │ 説明                             │"
echo "├────────────┼────────────────────────────────────────────┼──────────────────────────────────┤"

echo "$JSON_CONTENT" | jq -r '.files[] | "\(.type)\t\(.file)\t\(.desc)"' | while IFS=$'\t' read -r type file desc; do
    printf "│ %-10s │ %-42s │ %-32s │\n" "$type" "$file" "$desc"
done

echo "└────────────┴────────────────────────────────────────────┴──────────────────────────────────┘"

# --- 分割判断の表示 ---
echo ""
if [ "$SHOULD_SPLIT" = "true" ] && [ "$NUM_GROUPS" -gt 1 ]; then
    echo -e "${YELLOW}分割を推奨: ${NUM_GROUPS}つのグループに分けられます${NC}"
    echo ""

    for i in $(seq 0 $((NUM_GROUPS - 1))); do
        GROUP_MSG=$(echo "$JSON_CONTENT" | jq -r ".groups[$i].message")
        GROUP_FILES=$(echo "$JSON_CONTENT" | jq -r ".groups[$i].files[]")
        echo -e "  ${CYAN}グループ$((i + 1)):${NC} ${GROUP_MSG}"
        echo "$GROUP_FILES" | while read -r f; do
            echo "    - $f"
        done
    done

    echo ""

    # jj split コマンドの提示
    if [ "$REPO_TYPE" = "jj" ]; then
        echo -e "${BOLD}分割コマンド:${NC}"
        FIRST_GROUP_FILES=$(echo "$JSON_CONTENT" | jq -r '.groups[0].files | join(" ")')
        FIRST_MSG=$(echo "$JSON_CONTENT" | jq -r '.groups[0].message')
        REMAINING_MSG=$(echo "$JSON_CONTENT" | jq -r '.groups[1].message')
        echo -e "  1. ${GREEN}jj split ${FIRST_GROUP_FILES}${NC}"
        echo -e "     → 分割後: ${GREEN}jj describe -r @- -m \"${FIRST_MSG}\"${NC}"
        echo -e "     → 残り:   ${GREEN}jj describe -m \"${REMAINING_MSG}\"${NC}"

        if [ "$NUM_GROUPS" -gt 2 ]; then
            echo ""
            echo -e "  ${YELLOW}※ 3グループ以上の場合は残りに対してさらに jj split を実行してください${NC}"
            for i in $(seq 2 $((NUM_GROUPS - 1))); do
                EXTRA_MSG=$(echo "$JSON_CONTENT" | jq -r ".groups[$i].message")
                EXTRA_FILES=$(echo "$JSON_CONTENT" | jq -r ".groups[$i].files | join(\" \")")
                echo -e "  $((i)). ${GREEN}jj split ${EXTRA_FILES}${NC}"
                echo -e "     → ${GREEN}jj describe -r @- -m \"${EXTRA_MSG}\"${NC}"
            done
        fi
    fi

    echo ""
    echo -e "どうする？"
    echo -e "  ${BOLD}s${NC}) 分割コマンドを実行"
    echo -e "  ${BOLD}1${NC}) 分割せず1つ目のメッセージでdescribe"
    echo -e "  ${BOLD}e${NC}) エディタで編集"
    echo -e "  ${BOLD}n${NC}) キャンセル"
    echo -e "選択: \c"
    read -r answer

    case "$answer" in
        s|S)
            if [ "$REPO_TYPE" = "jj" ]; then
                echo -e "${GREEN}分割を実行中...${NC}"

                # 最後のグループ以外を順にsplit
                # split後: @- = 分離されたファイル群, @ = 残り
                for i in $(seq 0 $((NUM_GROUPS - 2))); do
                    GROUP_FILES=$(echo "$JSON_CONTENT" | jq -r ".groups[$i].files | join(\" \")")
                    GROUP_MSG=$(echo "$JSON_CONTENT" | jq -r ".groups[$i].message")
                    jj split $GROUP_FILES
                    jj describe -r @- -m "$GROUP_MSG"
                done

                # 最後のグループは残り全部なのでdescribeのみ
                LAST_MSG=$(echo "$JSON_CONTENT" | jq -r ".groups[$((NUM_GROUPS - 1))].message")
                jj describe -m "$LAST_MSG"

                echo -e "${GREEN}分割完了${NC}"
                jj log -r 'ancestors(@, 2)' --no-graph
            else
                echo -e "${YELLOW}git での自動分割は未対応です。手動で分割してください。${NC}"
            fi
            ;;
        1)
            FIRST_MSG=$(echo "$JSON_CONTENT" | jq -r '.groups[0].message')
            if [ "$REPO_TYPE" = "jj" ]; then
                jj describe -m "$FIRST_MSG"
                echo -e "${GREEN}describe完了${NC}"
            else
                git commit -m "$FIRST_MSG"
                echo -e "${GREEN}コミット完了${NC}"
            fi
            ;;
        e|E)
            if [ "$REPO_TYPE" = "jj" ]; then jj describe; else git commit -e; fi
            ;;
        *)
            echo "キャンセル"
            ;;
    esac
else
    # 分割不要
    MESSAGE=$(echo "$JSON_CONTENT" | jq -r '.groups[0].message')
    echo -e "${GREEN}分割不要 — 1つのコミットにまとまります${NC}"
    echo -e "\n${BOLD}メッセージ:${NC} ${MESSAGE}"
    echo -e "\n使用する？ (y/n/e[dit]): \c"
    read -r answer

    case "$answer" in
        y|Y)
            if [ "$REPO_TYPE" = "jj" ]; then
                jj describe -m "$MESSAGE"
                echo -e "${GREEN}describe完了${NC}"
            else
                git commit -m "$MESSAGE"
                echo -e "${GREEN}コミット完了${NC}"
            fi
            ;;
        e|E)
            if [ "$REPO_TYPE" = "jj" ]; then jj describe; else git commit -e -m "$MESSAGE"; fi
            ;;
        *)
            echo "キャンセル"
            ;;
    esac
fi
