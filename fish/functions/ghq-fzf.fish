function ghq-fzf --description 'Select ghq repository with fzf and change directory'
    set -l cache_dir "$HOME/.cache"
    set -l cache_file "$cache_dir/ghq-fzf-list"
    set -l sig_file "$cache_dir/ghq-fzf-list.sig"

    # --refresh でキャッシュを再生成（workspace追加時など手動更新用）
    if test "$argv[1]" = --refresh
        rm -f $cache_file $sig_file
    end

    set -l ghq_root (ghq root)

    # .git/.jj マーカー一覧を軽量シグネチャにし、clone/workspace の増減を検知する
    # (fd スキャン ~0.15s。ghq list は使わない)
    set -l marker_file (mktemp)
    fd -H -t d -t f -d 5 '^\.(git|jj)$' $ghq_root 2>/dev/null | string trim -r -c / | sort >$marker_file
    set -l sig (shasum $marker_file | string split -f1 ' ')
    if not test -d "$cache_dir"
        mkdir -p $cache_dir
    end
    if not test -f "$sig_file"; or test "$sig" != (cat $sig_file 2>/dev/null)
        rm -f $cache_file
        echo $sig >$sig_file
    end

    # キャッシュが無ければリストを生成して保存（clone/workspace追加時のみ更新が必要）
    if not test -f $cache_file
        set -l repos_file (mktemp)
        set -l jj_file (mktemp)
        set -l jj_parent_file (mktemp)

        while read -l marker
            # linked workspace は検証後に jj_file からのみ追加する
            if string match -q '*/.jj' $marker; and test -f $marker/repo
                continue
            end
            dirname $marker
        end <$marker_file | sort -u >$repos_file

        # jj workspace (.jj/repo がファイルで親を参照しているもの)
        while read -l marker
            if not string match -q '*/.jj' $marker
                continue
            end
            if not test -f $marker/repo
                continue
            end
            set -l ws_path (dirname $marker)
            # forget済み(jj workspace listが空)なworkspaceは除外
            set -l ws_alive (jj workspace list -R $ws_path 2>/dev/null)
            if test -z "$ws_alive"
                continue
            end
            set -l parent_jj (cat $marker/repo)
            set -l parent_path (dirname (dirname $parent_jj))
            echo $ws_path
            # workspace と親のマッピングを保存
            printf "%s\t%s\n" $ws_path $parent_path >>$jj_parent_file
        end <$marker_file >$jj_file

        # マーカー由来のリポジトリ + jj workspace をマージし、jj workspace を親の直後にソート
        begin
            cat $repos_file
            cat $jj_file
        end | awk -v ghq_root="$ghq_root" -v jj_parent_file="$jj_parent_file" '
        BEGIN {
            while ((getline line < jj_parent_file) > 0) {
                split(line, f, "\t")
                ws_parent[f[1]] = f[2]
            }
            close(jj_parent_file)
        }
        {
            path = $0
            short = path
            sub(ghq_root "/", "", short)

            # jj workspace の場合、親のパスをソートキーにする
            if (path in ws_parent) {
                parent = ws_parent[path]
                parent_short = parent
                sub(ghq_root "/", "", parent_short)
                # ソートキー: 親のパス + /~ + workspace名で親の直後に来るようにする
                n = split(short, parts, "/")
                ws_name = parts[n]
                print parent_short " " ws_name "\t" path "\t" parent
            } else {
                print short "\t" path "\t"
            }
        }
        ' | sort -t\t -k1,1 | awk -F'\t' '!seen[$2]++ {print $2 "\t" $3}' | awk -F'\t' -v ghq_root="$ghq_root" -v jj_file="$jj_file" '
            BEGIN {
                while ((getline line < jj_file) > 0) jj_ws[line] = 1
                close(jj_file)
            }
            {
                line = $1
                parent = $2
                short = line
                sub(ghq_root "/", "", short)
                n = split(short, parts, "/")
                host = parts[1]
                owner = parts[2]
                repo = parts[3]

                if (host != prev_host) {
                    printf "\033[3;36m── %s ──────────────────────\033[0m\n", host
                    prev_host = host
                    prev_owner = ""
                }
                if (owner != prev_owner) {
                    printf "\033[3;36m── %s ──\033[0m\n", owner
                    prev_owner = owner
                }

                if (line in jj_ws && parent != "") {
                    # 親リポジトリ名/workspace名 で表示
                    parent_short = parent
                    sub(ghq_root "/", "", parent_short)
                    pn = split(parent_short, pp, "/")
                    parent_repo = pp[3]
                    printf "\033[32m  󰘬 %s/%s\033[0m\t%s\n", parent_repo, repo, short
                } else {
                    printf "  %s\t%s\n", repo, short
                }
            }
        ' >$cache_file

        rm -f $repos_file $jj_file $jj_parent_file
    end

    rm -f $marker_file

    set -l preview_command
    if command -q eza
        set preview_command "eza -TF --level=1 --icons=always"
    else
        set preview_command "ls -l"
    end

    set -l src (cat $cache_file | fzf --ansi --color=fg:-1 --with-nth=1 --nth=1 --delimiter='\t' --preview "$preview_command $ghq_root/{2}")

    if test -n "$src"
        set -l path (string split \t $src)[2]
        cd $ghq_root/$path
    end
    # 選択/キャンセル問わず再描画（escape時に表示が残るのを防ぐ）
    commandline -f repaint
end
