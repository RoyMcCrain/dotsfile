function sync-firecrawl-key --description 'Sync FIRECRAWL_API_KEY from Bitwarden into macOS Keychain'
    if not command -q bw
        echo "bw: 実行ファイルが見つかりません" >&2
        return 127
    end

    if test -z "$BW_SESSION"
        echo "BW_SESSION 未設定。先に bw-unlock を実行してください" >&2
        return 1
    end

    bw sync
    set -l key (bw get password firecrawl-api-key)
    if test -z "$key"
        echo "sync-firecrawl-key: Bitwarden から取得できませんでした" >&2
        return 1
    end

    security add-generic-password -U -s firecrawl-api-key -a $USER -w $key
    set -gx FIRECRAWL_API_KEY $key
    echo "FIRECRAWL_API_KEY を Keychain に保存し、現在のシェルにも反映しました"
end
