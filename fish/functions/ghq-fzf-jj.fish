function ghq-fzf-jj --description 'Select jj workspace with fzf and change directory'
    set -l ghq_root (ghq root)
    set -l ws_file (mktemp)
    set -l data_file (mktemp)

    # jj workspace (.jj/repo がファイルで親を参照しているもの)
    find $ghq_root -name .jj -type d -maxdepth 5 2>/dev/null | while read jj_dir
        if test -f $jj_dir/repo
            echo (dirname $jj_dir)
        end
    end > $ws_file

    # workspace の親リポジトリを取得 (.jj/repo ファイルから)
    set -l roots_file (mktemp)
    cat $ws_file | while read ws
        set -l repo_file $ws/.jj/repo
        if test -f $repo_file
            set -l parent_jj (cat $repo_file)
            # /path/to/parent/.jj/repo -> /path/to/parent
            echo (dirname (dirname $parent_jj))
        end
    end | sort -u > $roots_file

    # データを収集
    begin; cat $roots_file; cat $ws_file; end | sort -u | while read line
        set -l short (string replace "$ghq_root/" '' $line)
        set -l parts (string split '/' $short)
        set -l repo $parts[3]
        set -l subpath (string join '/' $parts[4..-1])

        # jj 情報を取得
        set -l bookmark (jj log -r @ -T 'bookmarks' --no-graph -R $line 2>/dev/null | head -1)
        if test -z "$bookmark"
            set bookmark (jj log -r @ -T 'change_id.shortest()' --no-graph -R $line 2>/dev/null)
        end
        set -l status_out (jj status -R $line 2>/dev/null)
        set -l added (printf '%s\n' $status_out | grep -c '^A')
        set -l modified (printf '%s\n' $status_out | grep -c '^M')
        set -l deleted (printf '%s\n' $status_out | grep -c '^D')
        set -l mtime (stat -f %Sm -t '%Y/%m/%d %H:%M' $line/.jj 2>/dev/null)

        # workspace フラグ
        set -l is_ws 0
        if grep -qx "$line" $ws_file
            set is_ws 1
        end

        # タブ区切りで保存
        if test -n "$subpath"
            printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$repo/$subpath" $bookmark $added $modified $deleted $mtime $short $is_ws
        else
            printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" $repo $bookmark $added $modified $deleted $mtime $short $is_ws
        end
    end > $data_file

    # 最大幅を計算して出力
    set -l src (cat $data_file | awk -F'\t' '
    {
        if (length($1) > max_name) max_name = length($1)
        if (length($2) > max_bm) max_bm = length($2)
        data[NR] = $0
        count = NR
    }
    END {
        for (i = 1; i <= count; i++) {
            split(data[i], f, "\t")
            name = f[1]
            bookmark = f[2]
            added = f[3]
            modified = f[4]
            deleted = f[5]
            mtime = f[6]
            short = f[7]
            is_ws = f[8]

            if (is_ws == 1) {
                printf "\033[34m󰘬 %-" max_name "s\033[0m  %-" max_bm "s  \033[32m+%3s\033[0m \033[33m~%3s\033[0m \033[31m-%3s\033[0m  %s\t%s\n", name, bookmark, added, modified, deleted, mtime, short
            } else {
                printf "󰳐 %-" max_name "s  %-" max_bm "s  \033[32m+%3s\033[0m \033[33m~%3s\033[0m \033[31m-%3s\033[0m  %s\t%s\n", name, bookmark, added, modified, deleted, mtime, short
            }
        }
    }
    ' | fzf --ansi --color=fg:-1 --nth=1 --with-nth=1 --delimiter='\t' --preview '')

    rm -f $ws_file $roots_file $data_file

    if test -n "$src"
        set -l path (string split \t $src)[2]
        cd $ghq_root/$path
        commandline -f repaint
    end
end
