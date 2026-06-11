#!/bin/bash
# Claude Code status line: 1行目=モデル/ディレクトリ/ブランチ、2行目=コンテキストバー/コスト/経過時間
input=$(cat)

MODEL=$(echo "$input" | jq -r '.model.display_name')
DIR=$(echo "$input" | jq -r '.workspace.current_dir')
COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
DURATION_MS=$(echo "$input" | jq -r '.cost.total_duration_ms // 0')

CYAN='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; RESET='\033[0m'

# コンテキスト使用率で色分け
if [ "$PCT" -ge 90 ]; then BAR_COLOR="$RED"
elif [ "$PCT" -ge 70 ]; then BAR_COLOR="$YELLOW"
else BAR_COLOR="$GREEN"; fi

FILLED=$((PCT / 10)); EMPTY=$((10 - FILLED))
printf -v FILL "%${FILLED}s"; printf -v PAD "%${EMPTY}s"
BAR="${FILL// /█}${PAD// /░}"

MINS=$((DURATION_MS / 60000)); SECS=$(((DURATION_MS % 60000) / 1000))

# jjはdetached HEADでブランチ名が空になるため短縮ハッシュにフォールバック
BRANCH=""
if git -C "$DIR" rev-parse --git-dir > /dev/null 2>&1; then
  NAME=$(git -C "$DIR" branch --show-current 2>/dev/null)
  [ -z "$NAME" ] && NAME=$(git -C "$DIR" rev-parse --short HEAD 2>/dev/null)
  [ -n "$NAME" ] && BRANCH=" | 🌿 $NAME"
fi

# レート制限はPro/Max限定かつ初回API応答後のみ存在するため、absent時は非表示
FIVE_H=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
WEEK=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
LIMITS=""
[ -n "$FIVE_H" ] && LIMITS=" | 5h: $(printf '%.0f' "$FIVE_H")%"
[ -n "$WEEK" ] && LIMITS="${LIMITS} | 7d: $(printf '%.0f' "$WEEK")%"

COST_FMT=$(printf '$%.2f' "$COST")
echo -e "${CYAN}[$MODEL]${RESET} 📁 ${DIR##*/}$BRANCH"
echo -e "${BAR_COLOR}${BAR}${RESET} ${PCT}% | ${YELLOW}${COST_FMT}${RESET} | ⏱️ ${MINS}m ${SECS}s${LIMITS}"
