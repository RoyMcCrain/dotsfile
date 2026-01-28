function jjw --description 'Create jj workspace with .env symlinks'
    set -l src_root (jj root)
    or return 1

    set -l dest
    if test (count $argv) -eq 0
        set -l repo_name (basename $src_root)
        set -l bm (jj log -r @ -T 'bookmarks' --no-graph 2>/dev/null)
        if test -z "$bm"
            set bm (jj log -r @ -T 'change_id.shortest()' --no-graph 2>/dev/null)
        end
        set dest ../$repo_name-$bm
        jj workspace add $dest
        or return 1
    else
        set dest $argv[1]
        jj workspace add $argv
        or return 1
    end

    set dest (realpath $dest)

    for env_file in (find $src_root -name '.env*' -not -path '*/.git/*' -not -path '*/.jj/*' -not -path '*/node_modules/*')
        set -l rel_path (string replace "$src_root/" '' $env_file)
        set -l dest_path $dest/$rel_path
        mkdir -p (dirname $dest_path)
        ln -sf $env_file $dest_path
    end

    # direnv allow
    if command -q direnv; and test -f $dest/.envrc
        direnv allow $dest
    end
end
