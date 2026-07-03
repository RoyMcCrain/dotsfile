#!/usr/bin/env fish

# Fish用dotfilesシンボリックリンク作成スクリプト（改良版）
# 既存ファイルの安全な処理とエラーハンドリング付き ✨

function print_header
    echo ""
    echo "🐟 Fish Dotfiles Symlink Creator 🐟"
    echo "=================================="
    echo ""
end

function print_success
    echo "✅ $argv"
end

function print_warning
    echo "⚠️  $argv"
end

function print_error
    echo "❌ $argv"
end

function create_symlink
    set source_file $argv[1]
    set destination $argv[2]
    set description $argv[3]
    
    if not test -e $source_file
        print_error "Source file not found: $source_file"
        return 1
    end
    
    # 親ディレクトリを作成
    set parent_dir (dirname $destination)
    if not test -d $parent_dir
        mkdir -p $parent_dir
        print_success "Created directory: $parent_dir"
    end
    
    # 既存ファイル/リンクの処理
    if test -L $destination
        print_warning "Removing existing symlink: $destination"
        rm $destination
    else if test -e $destination
        print_warning "Backing up existing file: $destination -> $destination.backup"
        mv $destination $destination.backup
    end
    
    # シンボリックリンク作成
    if ln -sf $source_file $destination
        print_success "Created symlink: $description"
        echo "  $source_file -> $destination"
    else
        print_error "Failed to create symlink: $destination"
        return 1
    end
end

# メイン処理開始
print_header

# 依存関係チェック
if not command -q ghq
    print_error "ghq command not found. Please install ghq first."
    exit 1
end

# ベースディレクトリ設定
set BASE_DIR (ghq root)/github.com/RoyMcCrain/dotsfile

if not test -d $BASE_DIR
    print_error "Dotfiles directory not found: $BASE_DIR"
    print_error "Please run: ghq get github.com/RoyMcCrain/dotsfile"
    exit 1
end

echo "Base directory: $BASE_DIR"
echo ""

# Fish設定ファイル
echo "📁 Setting up Fish configuration files..."
set FISH_CONFIG_ITEMS config.fish abbreviations.fish fzf.fish
for item in $FISH_CONFIG_ITEMS
    create_symlink $BASE_DIR/fish/$item ~/.config/fish/$item "Fish config: $item"
end

echo ""

# Fish関数ディレクトリ
echo "⚙️  Setting up Fish functions..."
create_symlink $BASE_DIR/fish/functions ~/.config/fish/functions "Fish functions directory"

echo ""

# Fish補完ディレクトリ
echo "🔧 Setting up Fish completions..."
create_symlink $BASE_DIR/fish/completions ~/.config/fish/completions "Fish completions directory"

echo ""

# 共通設定ファイル
echo "🛠️  Setting up common configuration files..."
set COMMON_ITEMS nvim gitconfig bash_profile
for item in $COMMON_ITEMS
    if test $item = "nvim"
        create_symlink $BASE_DIR/$item ~/.config/$item "Neovim configuration"
    else
        create_symlink $BASE_DIR/$item ~/.$item "Configuration: $item"
    end
end

echo ""

# devbox設定ファイル
echo "📦 Setting up devbox configuration..."
set DEVBOX_GLOBAL_DIR ~/.local/share/devbox/global/default
if not test -d $DEVBOX_GLOBAL_DIR
    mkdir -p $DEVBOX_GLOBAL_DIR
end
create_symlink $BASE_DIR/devbox/devbox.json $DEVBOX_GLOBAL_DIR/devbox.json "devbox global config"

echo ""

# jujutsu設定ファイル
echo "Setting up jujutsu configuration..."
create_symlink $BASE_DIR/jjconfig.toml ~/.config/jj/config.toml "jujutsu config"

echo ""

# cmux設定ファイル
echo "Setting up cmux configuration..."
create_symlink $BASE_DIR/cmux ~/.config/cmux "cmux configuration"

echo ""

# ghostty設定ファイル
echo "Setting up ghostty configuration..."
create_symlink $BASE_DIR/ghostty ~/.config/ghostty "ghostty configuration"

echo ""

# SSH設定ファイル（Bitwarden SSH agent を IdentityAgent で常用）
echo "🔑 Setting up SSH configuration..."
create_symlink $BASE_DIR/ssh/config ~/.ssh/config "SSH config"

# WSL2のみ: Bitwarden SSH agent ブリッジ（Windows named pipe -> unix socket）
if string match -q '*microsoft*' (uname -r)
    echo "🪟 Setting up Bitwarden SSH agent bridge (WSL2)..."
    create_symlink $BASE_DIR/scripts/wsl/bitwarden-ssh-agent.service ~/.config/systemd/user/bitwarden-ssh-agent.service "Bitwarden SSH agent bridge"
    systemctl --user daemon-reload
    systemctl --user enable --now bitwarden-ssh-agent.service
end

echo ""

# Claude Code 設定（settings.json が参照する hooks/statusline も含めて一式リンクする）
echo "🤖 Setting up Claude Code configuration..."
create_symlink $BASE_DIR/claude/settings.json ~/.claude/settings.json "Claude settings"
create_symlink $BASE_DIR/claude/statusline.sh ~/.claude/statusline.sh "Claude status line script"
set CLAUDE_ITEMS agents commands hooks rules skills sandbox
for item in $CLAUDE_ITEMS
    create_symlink $BASE_DIR/claude/$item ~/.claude/$item "Claude $item"
end

echo ""

# Claude Code グローバルMCP（user scope: 全プロジェクトで有効）
# ~/.claude.json は秘密情報を含むためリンクせず、定義ファイルから import する
echo "🔌 Setting up Claude Code global MCP servers..."
set MCP_FILE $BASE_DIR/claude/mcp-servers.json
if test -f $MCP_FILE; and command -q jq; and command -q claude
    for name in (jq -r 'keys[]' $MCP_FILE)
        claude mcp remove -s user $name >/dev/null 2>&1
        if claude mcp add-json -s user $name (jq -c ".[\"$name\"]" $MCP_FILE) >/dev/null 2>&1
            print_success "Registered global MCP: $name"
        else
            print_error "Failed to register MCP: $name"
        end
    end
else
    print_warning "Skipped MCP setup (need jq + claude + $MCP_FILE)"
end

echo ""

echo "🤖 Setting up Pi Coding Agent configuration..."
set PI_AGENT_DIR ~/.pi/agent
if not test -d $PI_AGENT_DIR
    mkdir -p $PI_AGENT_DIR
end
create_symlink $BASE_DIR/pi/agent/AGENTS.md $PI_AGENT_DIR/AGENTS.md "Pi global instructions"
create_symlink $BASE_DIR/pi/agent/APPEND_SYSTEM.md $PI_AGENT_DIR/APPEND_SYSTEM.md "Pi appended system prompt"
create_symlink $BASE_DIR/pi/agent/settings.json $PI_AGENT_DIR/settings.json "Pi settings"
create_symlink $BASE_DIR/pi/agent/models.json $PI_AGENT_DIR/models.json "Pi custom models"
create_symlink $BASE_DIR/pi/agent/extensions $PI_AGENT_DIR/extensions "Pi extensions"

echo ""
echo "🤖 Setting up shared agent skills..."
set AGENTS_SKILL_DIR ~/.agents/skills
set AGENTS_SKILL_BACKUP_DIR ~/.agents/skill-backups
if not test -d $AGENTS_SKILL_DIR
    mkdir -p $AGENTS_SKILL_DIR
end
if not test -d $AGENTS_SKILL_BACKUP_DIR
    mkdir -p $AGENTS_SKILL_BACKUP_DIR
end
for OLD_NAME in cursor fugu
    set OLD_DEST $AGENTS_SKILL_DIR/$OLD_NAME
    if test -L $OLD_DEST
        rm $OLD_DEST
        print_success "Removed stale agent skill link: $OLD_NAME"
    else if test -e $OLD_DEST
        set BACKUP "$AGENTS_SKILL_BACKUP_DIR/$OLD_NAME.backup-"(date +%Y%m%d%H%M%S)
        print_warning "Backing up renamed agent skill: $OLD_DEST -> $BACKUP"
        mv $OLD_DEST $BACKUP
    end
end
set SHARED_AGENT_SKILLS $BASE_DIR/.agents/skills/cmux* $BASE_DIR/.agents/skills/cursor-review $BASE_DIR/.agents/skills/fugu-review $BASE_DIR/.agents/skills/parallel-review $BASE_DIR/claude/skills/claude-review $BASE_DIR/codex/skills/codex-review
for SKILL in $SHARED_AGENT_SKILLS
    if not test -f $SKILL/SKILL.md
        continue
    end
    set NAME (basename $SKILL)
    set DEST $AGENTS_SKILL_DIR/$NAME
    if test -L $DEST
        rm $DEST
    else if test -e $DEST
        if diff -qr $SKILL $DEST >/dev/null 2>&1
            rm -rf $DEST
        else
            set BACKUP "$AGENTS_SKILL_BACKUP_DIR/$NAME.backup-"(date +%Y%m%d%H%M%S)
            print_warning "Backing up existing agent skill: $DEST -> $BACKUP"
            mv $DEST $BACKUP
        end
    end
    if ln -sfn $SKILL $DEST
        print_success "Linked agent skill: $NAME"
    else
        print_error "Failed to link agent skill: $DEST"
    end
end

echo ""

echo "🎉 Fish configuration setup completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Set fish as default shell:"
echo "      chsh -s (which fish)"
echo ""
echo "   2. Start fish shell:"
echo "      fish"
echo ""
echo "   3. Test abbreviations:"
echo "      g<space> → should expand to 'git'"
echo "      a<space> → should expand to 'nvim'"
echo ""
echo "   4. Test fzf integration:"
echo "      Ctrl+T → ghq repository selection"
echo "      Ctrl+R → command history search"
echo "      Ctrl+Z → smart vim resume"
echo ""
echo "🐟 Happy fishing! 🐟"
