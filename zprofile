# このファイル(zprofile)は login shell が読む。
# Claude Code の Bash ツールと Zed GUI は login 非interactive な zsh を使い zshrc を読まないため、
# fish と同じ dev 環境(devbox global 由来のツール)はここで揃える。zsh は対話作業に使わないので zshrc は持たない。

# devbox global tools (jj, go, gh, node, pnpm, ...)
command -v devbox >/dev/null && eval "$(devbox global shellenv)"

# 追加 PATH（cargo / ローカル bin / npm global / gcloud / LM Studio / windsurf）
for d in "$HOME/.cargo/bin" "$HOME/.local/bin" \
         "$HOME/.local/share/npm-global/bin" \
         "$HOME/.local/google-cloud-sdk/bin" \
         "$HOME/.lmstudio/bin" \
         "$HOME/.codeium/windsurf/bin"; do
  [ -d "$d" ] && PATH="$d:$PATH"
done
export PATH

# direnv: login 非interactive shell（Claude/Zed の Bash）では precmd hook が発火しない。
# そのため起動時に cwd の .envrc を直接評価し repo-local ツール（cld など）を通す。
# PATH 構築後に実行して repo-local を優先させる。loading ログは抑制（2>/dev/null）。
# .envrc が未許可だと黙ってスキップされるので、repo-local ツールが見つからない時は
# `direnv status` / `direnv allow` を確認する。
command -v direnv >/dev/null && eval "$(direnv export zsh 2>/dev/null)"
