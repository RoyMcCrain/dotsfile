function claude --description 'Run claude inside a write-restricted macOS sandbox'
    # 関数名と同じ claude を PATH 上から解決（再帰しない）
    set -l claude_bin (type -P claude)
    if test -z "$claude_bin"
        echo "claude: 実行ファイルが見つかりません" >&2
        return 127
    end

    set -l profile $HOME/.claude/sandbox/claude-sandbox.sb

    # macOS 以外、またはプロファイル未配置ならサンドボックスなしで起動
    if not command -q sandbox-exec; or not test -e $profile
        $claude_bin $argv
        return $status
    end

    # HOME をプロファイルへ渡して起動（守る対象は HOME 配下の固定パスのみ）
    sandbox-exec \
        -D HOME=$HOME \
        -f $profile \
        $claude_bin $argv
end
