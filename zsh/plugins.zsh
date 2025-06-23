# プラグインディレクトリ
ZSH_PLUGINS_DIR="$HOME/.zsh/plugins"

# プラグインディレクトリを作成
mkdir -p "$ZSH_PLUGINS_DIR"

# プラグインのインストール関数
install_plugin() {
  local repo="$1"
  local name=$(basename "$repo")
  local plugin_dir="$ZSH_PLUGINS_DIR/$name"
  
  if [ ! -d "$plugin_dir" ]; then
    echo "Installing $name..."
    git clone "https://github.com/$repo.git" "$plugin_dir"
  fi
}

# プラグインの読み込み関数
load_plugin() {
  local name="$1"
  local plugin_file="$2"
  local plugin_dir="$ZSH_PLUGINS_DIR/$name"
  
  if [ -f "$plugin_dir/$plugin_file" ]; then
    source "$plugin_dir/$plugin_file"
  elif [ -f "$plugin_dir/$name.plugin.zsh" ]; then
    source "$plugin_dir/$name.plugin.zsh"
  elif [ -f "$plugin_dir/$name.zsh" ]; then
    source "$plugin_dir/$name.zsh"
  else
    echo "Warning: $name plugin not found"
  fi
}

# 必要なプラグインをインストール
install_plugin "zdharma-continuum/fast-syntax-highlighting"
install_plugin "zsh-users/zsh-completions" 
install_plugin "zsh-users/zsh-autosuggestions"
install_plugin "azu/ni.zsh"
install_plugin "olets/zsh-abbr"

# プラグインを読み込み
load_plugin "fast-syntax-highlighting" "fast-syntax-highlighting.plugin.zsh"
load_plugin "zsh-autosuggestions" "zsh-autosuggestions.zsh"
load_plugin "ni.zsh" "ni.plugin.zsh"

# zsh-abbrの初期化（依存関係の問題を回避）
if [ -f "$ZSH_PLUGINS_DIR/zsh-abbr/zsh-abbr.zsh" ]; then
  # 一時ディレクトリを事前に作成
  mkdir -p /tmp/zsh-job-queue/zsh-abbr 2>/dev/null
  
  # 依存関係のチェックをスキップする環境変数を設定
  export ABBR_QUIET=1
  export ABBR_FORCE_INSTALL=0
  
  # 通常どおり読み込み（エラーメッセージは表示する）
  source "$ZSH_PLUGINS_DIR/zsh-abbr/zsh-abbr.zsh"
fi

# zsh-completionsのfpathを追加
if [ -d "$ZSH_PLUGINS_DIR/zsh-completions/src" ]; then
  fpath=("$ZSH_PLUGINS_DIR/zsh-completions/src" $fpath)
fi

# 補完を再読み込み
autoload -U compinit && compinit
