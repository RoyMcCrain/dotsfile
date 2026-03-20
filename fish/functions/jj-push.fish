function jj-push --description 'Push current revision to bookmark'
    if not test -d .jj
        echo "Error: Not a jj repository" >&2
        return 1
    end

    set -l bookmark $argv[1]

    # bookmark未指定: 現在のリビジョンのbookmarkを検索
    # bookmarks テンプレートは "main*" のようにdirtyマーカーを含むので除去
    if test -z "$bookmark"
        set bookmark (jj log -r @ --no-graph -T 'bookmarks' 2>/dev/null | string trim | string replace -ra '[*]' '' | string split ' ' | head -1)
    end

    # bookmarkが見つからない場合
    if test -z "$bookmark"
        echo "現在のリビジョンにbookmarkがありません"
        echo ""
        jj log -r @ --no-graph
        echo ""
        read -P "bookmark名を入力 (空でキャンセル): " bookmark
        if test -z "$bookmark"
            echo "キャンセル"
            return 0
        end
        jj bookmark set $bookmark -r @
    end

    # mainへのpushをブロック
    if test "$bookmark" = main
        echo "mainへの直接pushは禁止です。手動で実行してください。" >&2
        return 1
    end

    echo "push: $bookmark"
    jj bookmark set $bookmark -r @
    jj git push --bookmark $bookmark
    jj log -r @
end
