function bw-unlock --description 'Unlock Bitwarden vault and export BW_SESSION'
    if not command -q bw
        echo "bw: 実行ファイルが見つかりません" >&2
        return 127
    end

    set -l session (bw unlock --raw $argv)
    if test -z "$session"
        echo "bw-unlock: アンロックに失敗しました" >&2
        return 1
    end

    set -gx BW_SESSION $session
    echo "BW_SESSION を設定しました"
end
