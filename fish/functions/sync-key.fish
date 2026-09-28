function sync-key --description 'Sync an API key from Bitwarden into macOS Keychain'
    set -lu fish_trace

    if test (count $argv) -lt 1 -o (count $argv) -gt 2
        echo "usage: sync-key <bitwarden-item-name> [ENV_VAR]" >&2
        return 2
    end

    set -l item "$argv[1]"
    set -l var

    if test (count $argv) -eq 2
        set var "$argv[2]"
        if test -z "$var"
            echo "sync-key: 環境変数名が不正です" >&2
            return 2
        end
    else
        set var (string upper (string replace -a - _ "$item"))
    end

    if test (string length -- "$item") -gt 128
        echo "sync-key: アイテム名が不正です" >&2
        return 2
    end
    if not string match -qr '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' -- "$item"
        echo "sync-key: アイテム名が不正です" >&2
        return 2
    end

    if not string match -qr '^[A-Z_][A-Z0-9_]*$' -- "$var"
        echo "sync-key: 環境変数名が不正です" >&2
        return 2
    end
    switch (string upper -- "$var")
        case PATH HOME USER SHELL BW_SESSION FISH_TRACE
            echo "sync-key: 環境変数名が不正です" >&2
            return 2
    end

    if not command -q bw
        echo "bw: 実行ファイルが見つかりません" >&2
        return 127
    end

    if not command -q security
        echo "security: 実行ファイルが見つかりません" >&2
        return 127
    end

    if test -z "$BW_SESSION"
        echo "BW_SESSION 未設定。先に bw-unlock を実行してください" >&2
        return 1
    end

    bw sync >/dev/null 2>&1
    if test $status -ne 0
        echo "sync-key: Bitwarden sync に失敗しました" >&2
        return 1
    end

    set -lu key (bw get password "$item" 2>/dev/null | string collect)
    set -l get_status $pipestatus[1]
    if test "$get_status" -ne 0
        set -e key
        echo "sync-key: Bitwarden から '$item' を取得できませんでした" >&2
        return 1
    end

    if test (count $key) -gt 1
        set -e key
        echo "sync-key: 取得した値が不正です" >&2
        return 1
    end

    if test -z "$key"; or string match -qr '[[:cntrl:]]' -- "$key"
        set -e key
        echo "sync-key: 取得した値が不正です" >&2
        return 1
    end

    set -lu cmd (__keychain_command "$item" "$key")
    if test $status -ne 0
        set -e key cmd
        echo "sync-key: Keychain への保存に失敗しました" >&2
        return 1
    end

    printf '%s\n' "$cmd" | security -i >/dev/null 2>&1
    if test $status -ne 0
        set -e key cmd
        echo "sync-key: Keychain への保存に失敗しました" >&2
        return 1
    end

    set -gx "$var" "$key"
    set -e key cmd
    echo "$var を Keychain に保存し、現在のシェルにも反映しました"
end
