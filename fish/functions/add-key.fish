function add-key --description 'Create a Bitwarden API key item, then cache it to Keychain'
    set -l item $argv[1]
    if test -z "$item"
        echo "usage: add-key <bitwarden-item-name>  (例: add-key firecrawl-api-key)" >&2
        return 2
    end

    if not command -q bw
        echo "bw: 実行ファイルが見つかりません" >&2
        return 127
    end

    if test -z "$BW_SESSION"
        echo "BW_SESSION 未設定。先に bw-unlock を実行してください" >&2
        return 1
    end

    # 重複作成を防ぐ（sync-key は同名複数だと取得に失敗するため）
    if bw get item $item >/dev/null 2>&1
        echo "add-key: '$item' は既に存在します。値の更新は Bitwarden で行い sync-key で反映を" >&2
        return 1
    end

    # 追加先フォルダは $BW_KEY_FOLDER (フォルダ名) で指定。未設定ならフォルダ無し
    set -l folder_id ""
    if test -n "$BW_KEY_FOLDER"
        set folder_id (bw list folders | jq -r --arg n "$BW_KEY_FOLDER" '.[] | select(.name==$n) | .id')
        if test -z "$folder_id"
            set folder_id (bw get template folder | jq --arg n "$BW_KEY_FOLDER" '.name=$n' | bw encode | bw create folder | jq -r '.id')
            echo "Bitwarden にフォルダ '$BW_KEY_FOLDER' を作成しました"
        end
    end

    read -s -P "$item の値を貼り付け: " value
    echo
    if test -z "$value"
        echo "add-key: 値が空です" >&2
        return 1
    end

    bw get template item \
        | jq --arg n "$item" --arg k "$value" --arg f "$folder_id" '.name=$n | .type=1 | .notes=null | .folderId=(if $f=="" then null else $f end) | .login={username:"",password:$k,totp:null,uris:[]}' \
        | bw encode | bw create item >/dev/null
    set -e value

    echo "Bitwarden に '$item' を作成しました"

    # 作成後すぐ Keychain にキャッシュ＋現在のシェルへ反映
    sync-key $item

    # config.fish のキー一覧に自動追記（version 管理。差分は commit すること）
    set -l cfg ~/.config/fish/config.fish
    if test -f "$cfg"
        set -l current (grep '^set -l api_key_items ' "$cfg" | head -1 | string replace 'set -l api_key_items ' '')
        if contains $item (string split ' ' -- $current)
            echo "config.fish: '$item' は既に登録済み"
        else
            set -l tmp (mktemp)
            # 行末に item を追記。`>` は symlink を辿って実体に書くため symlink を壊さない
            awk -v it="$item" '/^set -l api_key_items / && !d {print $0" "it; d=1; next} {print}' "$cfg" >$tmp
            cat $tmp >"$cfg"
            rm -f $tmp
            echo "config.fish のキー一覧に '$item' を追記しました（jj/git で commit を）"
        end
    end
end
