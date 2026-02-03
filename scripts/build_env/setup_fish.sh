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
