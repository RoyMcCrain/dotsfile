#!/bin/bash
# Claude Code status line: 1行目=モデル/ディレクトリ/ブランチ、2行目=コンテキストバー/コスト/経過時間
input=$(cat)

MODEL=$(echo "$input" | jq -r '.model.display_name')
DIR=$(echo "$input" | jq -r '.workspace.current_dir')
COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
DURATION_MS=$(echo "$input" | jq -r '.cost.total_duration_ms // 0')

# effortは非対応モデルではabsent。あればモデル名に併記
EFFORT=$(echo "$input" | jq -r '.effort.level // empty')
[ -n "$EFFORT" ] && MODEL="$MODEL:$EFFORT"

CYAN='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; RESET='\033[0m'

# コンテキスト使用率で色分け
if [ "$PCT" -ge 90 ]; then BAR_COLOR="$RED"
elif [ "$PCT" -ge 70 ]; then BAR_COLOR="$YELLOW"
else BAR_COLOR="$GREEN"; fi

FILLED=$((PCT / 10)); EMPTY=$((10 - FILLED))
printf -v FILL "%${FILLED}s"; printf -v PAD "%${EMPTY}s"
BAR="${FILL// /█}${PAD// /░}"

MINS=$((DURATION_MS / 60000)); SECS=$(((DURATION_MS % 60000) / 1000))

# jjなら直近のブックマークと@の位置、gitならブランチ名(なければ短縮ハッシュ)
# --ignore-working-copy: statusline実行で勝手にスナップショットさせない
BRANCH=""
if jj -R "$DIR" --ignore-working-copy root > /dev/null 2>&1; then
  BOOKMARK=$(jj -R "$DIR" --ignore-working-copy log -r 'heads(::@ & bookmarks())' --no-graph -T 'bookmarks' 2>/dev/null)
  AT=$(jj -R "$DIR" --ignore-working-copy log -r @ --no-graph -T 'change_id.shortest(8)' 2>/dev/null)
  BRANCH=" | 🔖 ${BOOKMARK:-(no bookmark)} @ $AT"
elif git -C "$DIR" rev-parse --git-dir > /dev/null 2>&1; then
  NAME=$(git -C "$DIR" branch --show-current 2>/dev/null)
  [ -z "$NAME" ] && NAME=$(git -C "$DIR" rev-parse --short HEAD 2>/dev/null)
  [ -n "$NAME" ] && BRANCH=" | 🌿 $NAME"
fi

# セッションでの変更行数。両方0なら非表示
ADDED=$(echo "$input" | jq -r '.cost.total_lines_added // 0')
REMOVED=$(echo "$input" | jq -r '.cost.total_lines_removed // 0')
LINES=""
[ "$ADDED" -gt 0 ] || [ "$REMOVED" -gt 0 ] && LINES=" | ${GREEN}+${ADDED}${RESET} ${RED}-${REMOVED}${RESET}"

# epoch秒を時刻表示に変換。date -rはmacOS/BSD、-dはLinux(WSL2)用
fmt_epoch() {
  date -r "$1" +"$2" 2>/dev/null || date -d "@$1" +"$2" 2>/dev/null
}

# レート制限はPro/Max限定かつ初回API応答後のみ存在するため、absent時は非表示
# リセット時刻は5hなら時刻(HH:MM)、7dなら日付(M/D)で表示
FIVE_H=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
FIVE_H_AT=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
WEEK=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
WEEK_AT=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')
LIMITS=""
if [ -n "$FIVE_H" ]; then
  LIMITS=" | 5h: $(printf '%.0f' "$FIVE_H")%"
  [ -n "$FIVE_H_AT" ] && LIMITS="${LIMITS} (→$(fmt_epoch "$FIVE_H_AT" %H:%M))"
fi
if [ -n "$WEEK" ]; then
  LIMITS="${LIMITS} | 7d: $(printf '%.0f' "$WEEK")%"
  [ -n "$WEEK_AT" ] && LIMITS="${LIMITS} (→$(fmt_epoch "$WEEK_AT" %-m/%-d))"
fi

COST_FMT=$(printf '$%.2f' "$COST")
# 1行目: [モデル名:effort] 📁 ディレクトリ名 | 🔖 ブックマーク @ change-id (jj) / 🌿 ブランチ名 (git)
echo -e "${CYAN}[$MODEL]${RESET} 📁 ${DIR##*/}$BRANCH"
# 2行目: コンテキストバー 使用率% | 変更行数 | セッションコスト | 経過時間 | 5h/7dレート制限使用率 (→リセット時刻)
echo -e "${BAR_COLOR}${BAR}${RESET} ${PCT}%${LINES} | ${YELLOW}${COST_FMT}${RESET} | ⏱️ ${MINS}m ${SECS}s${LIMITS}"
