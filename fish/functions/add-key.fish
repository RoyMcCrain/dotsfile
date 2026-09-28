function add-key --description 'Create a Bitwarden API key item, then cache it to Keychain'
    set -lu fish_trace

    if test (count $argv) -ne 1
        echo "usage: add-key <bitwarden-item-name>  (例: add-key firecrawl-api-key)" >&2
        return 2
    end

    set -l item "$argv[1]"
    if test (string length -- "$item") -gt 128
        echo "add-key: アイテム名が不正です" >&2
        return 2
    end
    if not string match -qr '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' -- "$item"
        echo "add-key: アイテム名が不正です" >&2
        return 2
    end

    if not command -q bw
        echo "bw: 実行ファイルが見つかりません" >&2
        return 127
    end

    if not command -q jq
        echo "jq: 実行ファイルが見つかりません" >&2
        return 127
    end

    if not command -q rg
        echo "rg: 実行ファイルが見つかりません" >&2
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

    set -l cfg ~/.config/fish/config.fish
    if not test -f "$cfg"
        echo "add-key: config.fish が見つかりません ($cfg)" >&2
        return 1
    end

    if not test -w "$cfg"
        echo "add-key: config.fish に書き込めません" >&2
        return 1
    end

    set -l decl_line (rg -N '^\s*set -l api_key_items ' "$cfg" | head -1)
    if test -z "$decl_line"
        echo "add-key: config.fish に api_key_items 宣言が見つかりません" >&2
        return 1
    end

    bw sync >/dev/null 2>&1
    if test $status -ne 0
        echo "add-key: Bitwarden sync に失敗しました" >&2
        return 1
    end

    set -lu items_json (bw list items --search "$item" 2>/dev/null | string collect)
    set -l list_items_status $pipestatus[1]
    if test "$list_items_status" -ne 0
        echo "add-key: Bitwarden アイテム確認に失敗しました" >&2
        return 1
    end

    set -l dup_count
    set dup_count (printf '%s' "$items_json" | jq -er --arg n "$item" '
        if type != "array" then error("not array")
        elif any(.[]; type != "object" or ((.name | type) != "string")) then error("malformed")
        else [.[] | select(.name == $n)] | length
        end' 2>/dev/null)
    if test $status -ne 0 -o -z "$dup_count"
        echo "add-key: Bitwarden アイテム確認に失敗しました" >&2
        return 1
    end
    if test "$dup_count" -gt 0
        echo "add-key: '$item' は既に存在します。値の更新は Bitwarden で行い sync-key で反映を" >&2
        return 1
    end

    set -lu value
    read -s -P "$item の値を貼り付け: " value
    echo
    if test -z "$value"; or string match -qr '[[:cntrl:]]' -- "$value"
        set -e value
        echo "add-key: 値が不正です" >&2
        return 1
    end

    if not __keychain_command "$item" "$value" >/dev/null
        set -e value
        echo "add-key: 値が Keychain 保存要件を満たしません" >&2
        return 1
    end

    set -l folder_id ""
    if test -n "$BW_KEY_FOLDER"
        set -lu folders_json (bw list folders 2>/dev/null | string collect)
        set -l list_folders_status $pipestatus[1]
        if test "$list_folders_status" -ne 0
            set -e value
            echo "add-key: Bitwarden フォルダ確認に失敗しました" >&2
            return 1
        end

        set -l folder_count
        set folder_count (printf '%s' "$folders_json" | jq -er --arg n "$BW_KEY_FOLDER" '
            if type != "array" then error("not array")
            elif any(.[]; type != "object" or ((.name | type) != "string")) then error("malformed")
            else [.[] | select(.name == $n)] | length
            end' 2>/dev/null)
        if test $status -ne 0 -o -z "$folder_count"
            set -e value
            echo "add-key: Bitwarden フォルダ確認に失敗しました" >&2
            return 1
        end

        if test "$folder_count" -gt 1
            set -e value
            echo "add-key: Bitwarden フォルダ名が曖昧です" >&2
            return 1
        end

        if test "$folder_count" -eq 1
            set folder_id (printf '%s' "$folders_json" | jq -er --arg n "$BW_KEY_FOLDER" '
                if type != "array" then error("not array")
                elif any(.[]; type != "object" or ((.name | type) != "string")) then error("malformed")
                else (.[] | select(.name == $n) |
                    if (.id | type) == "string" and .id != "" then .id else error("bad id") end) // empty
                end' 2>/dev/null)
            if test $status -ne 0 -o -z "$folder_id" -o "$folder_id" = null
                set -e value
                echo "add-key: Bitwarden フォルダ確認に失敗しました" >&2
                return 1
            end
        else
            set -lu folder_json
            set folder_json (jq -n --arg n "$BW_KEY_FOLDER" '{name:$n}' 2>/dev/null | string collect)
            set -l folder_jq_status $pipestatus[1]
            if test "$folder_jq_status" -ne 0 -o -z "$folder_json"
                set -e value
                echo "add-key: Bitwarden フォルダ作成に失敗しました" >&2
                return 1
            end

            set -lu folder_encoded
            set folder_encoded (printf '%s' "$folder_json" | bw encode 2>/dev/null | string collect)
            set -l folder_enc_status $pipestatus[2]
            if test "$folder_enc_status" -ne 0 -o -z "$folder_encoded"
                set -e value folder_json
                echo "add-key: Bitwarden フォルダ作成に失敗しました" >&2
                return 1
            end

            set -lu folder_out
            set folder_out (printf '%s' "$folder_encoded" | bw create folder 2>/dev/null | string collect)
            set -l folder_create_status $pipestatus[2]
            if test "$folder_create_status" -ne 0 -o -z "$folder_out"
                set -e value folder_json folder_encoded
                echo "add-key: Bitwarden フォルダ作成に失敗しました" >&2
                return 1
            end

            set folder_id (printf '%s' "$folder_out" | jq -er 'if type == "object" and (.id | type) == "string" and .id != "" then .id else error("bad id") end' 2>/dev/null)
            if test $status -ne 0 -o -z "$folder_id" -o "$folder_id" = null
                set -e value folder_json folder_encoded
                echo "add-key: Bitwarden フォルダ作成に失敗しました" >&2
                return 1
            end
            echo "Bitwarden にフォルダ '$BW_KEY_FOLDER' を作成しました"
        end
    end

    set -lu item_json
    set item_json (printf '%s' "$value" | jq -n --arg n "$item" --arg f "$folder_id" -Rs \
        'input as $pwd | {name:$n,type:1,notes:null,folderId:(if $f=="" then null else $f end),login:{username:"",password:$pwd,totp:null,uris:[]}}' \
        2>/dev/null | string collect)
    set -l item_jq_status $pipestatus[2]
    if test "$item_jq_status" -ne 0 -o -z "$item_json"
        set -e value
        echo "add-key: Bitwarden への作成に失敗しました" >&2
        return 1
    end

    set -lu item_encoded
    set item_encoded (printf '%s' "$item_json" | bw encode 2>/dev/null | string collect)
    set -l item_enc_status $pipestatus[2]
    if test "$item_enc_status" -ne 0 -o -z "$item_encoded"
        set -e value item_json
        echo "add-key: Bitwarden への作成に失敗しました" >&2
        return 1
    end

    printf '%s' "$item_encoded" | bw create item >/dev/null 2>&1
    if test $status -ne 0
        set -e value item_json item_encoded
        echo "add-key: Bitwarden への作成に失敗しました" >&2
        return 1
    end
    set -e value item_json item_encoded

    echo "Bitwarden に '$item' を作成しました"

    if not sync-key "$item"
        echo "add-key: '$item' は Bitwarden に作成済みですが、Keychain 反映は未完了です。sync-key $item で復旧してください（config.fish の api_key_items への名前登録は別途必要）" >&2
        return 1
    end

    set -l current (string replace -r '^\s*set -l api_key_items ' '' $decl_line)
    if contains "$item" (string split ' ' -- $current)
        echo "config.fish: '$item' は既に登録済み"
    else
        set -l tmp (mktemp)
        if test -z "$tmp"
            echo "add-key: Bitwarden/Keychain 反映済みですが config.fish への追記に失敗しました。api_key_items に '$item' を手動で追加してください（add-key は再実行しない）" >&2
            return 1
        end
        if not awk -v it="$item" '/^[[:space:]]*set -l api_key_items / && !d {print $0" "it; d=1; next} {print}' "$cfg" >$tmp
            rm -f $tmp
            echo "add-key: Bitwarden/Keychain 反映済みですが config.fish への追記に失敗しました。api_key_items に '$item' を手動で追加してください（add-key は再実行しない）" >&2
            return 1
        end
        if not cat $tmp >"$cfg"
            rm -f $tmp
            echo "add-key: Bitwarden/Keychain 反映済みですが config.fish への追記に失敗しました。api_key_items に '$item' を手動で追加してください（add-key は再実行しない）" >&2
            return 1
        end
        rm -f $tmp
        echo "config.fish のキー一覧に '$item' を追記しました（jj/git で commit を）"
    end
end
