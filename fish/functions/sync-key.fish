function sync-key --description 'Sync an API key from Bitwarden into macOS Keychain'
    set -l item $argv[1]
    if test -z "$item"
        echo "usage: sync-key <bitwarden-item-name> [ENV_VAR]" >&2
        return 2
    end

    # ENV_VAR は引数2、省略時は item 名から導出 (fugu-api-key → FUGU_API_KEY)
    set -l var $argv[2]
    test -z "$var"; and set var (string upper (string replace -a - _ $item))

    if not command -q bw
        echo "bw: 実行ファイルが見つかりません" >&2
        return 127
    end

    if test -z "$BW_SESSION"
        echo "BW_SESSION 未設定。先に bw-unlock を実行してください" >&2
        return 1
    end

    bw sync
    set -l key (bw get password $item)
    if test -z "$key"
        echo "sync-key: Bitwarden から '$item' を取得できませんでした" >&2
        return 1
    end

    security add-generic-password -U -s $item -a $USER -w $key
    set -gx $var $key
    echo "$var を Keychain に保存し、現在のシェルにも反映しました"
end
