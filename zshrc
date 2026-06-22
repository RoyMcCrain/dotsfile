# zsh はインタラクティブ作業の主シェルではない（主は fish）が、
# GUI 起動の Zed / Claude Code の Bash ツールが zsh を使うため、
# fish と同じ dev 環境（devbox global 由来のツール）を揃えておく。

# devbox global tools (jj, go, gh, node, pnpm, direnv, ...)
command -v devbox >/dev/null && eval "$(devbox global shellenv)"

# 追加 PATH（cargo / ローカル bin / npm global / gcloud）
for d in "$HOME/.cargo/bin" "$HOME/.local/bin" \
         "$HOME/.local/share/npm-global/bin" "$HOME/.local/google-cloud-sdk/bin"; do
  [ -d "$d" ] && PATH="$d:$PATH"
done
export PATH

# direnv: プロジェクトの .envrc 経由で repo-local の cld(go/bin) を通す
command -v direnv >/dev/null && eval "$(direnv hook zsh)"

# Added by LM Studio CLI (lms)
export PATH="$PATH:/Users/roy/.lmstudio/bin"
# End of LM Studio CLI section

# Added by Devin
export PATH="/Users/roy/.codeium/windsurf/bin:$PATH"
