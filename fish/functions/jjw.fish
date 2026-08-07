function jjw --description 'Create jj workspace with .env symlinks'
    set -l src_root (jj root)
    or return 1

    set -l dest
    if test (count $argv) -eq 0
        set -l repo_name (basename $src_root)
        set -l bm (jj log -r @ -T 'bookmarks' --no-graph 2>/dev/null | string trim)
        if test -z "$bm"
            set bm (jj log -r @ -T 'change_id.shortest()' --no-graph 2>/dev/null | string trim)
        end
        set bm (string split -n ' ' -- $bm)[1]
        set dest ../$repo_name-$bm
        JJ_EDITOR=true jj workspace add $dest
        or return 1
    else
        # destination = last positional; skip values of options that take an argument
        set -l skip_next 0
        for arg in $argv
            if test $skip_next -eq 1
                set skip_next 0
                continue
            end
            if string match -q -- '--name=*' $arg; or string match -q -- '--revision=*' $arg
                continue
            end
            if string match -q -- '--name' $arg; or string match -q -- '--revision' $arg; or string match -q -- '-r' $arg
                set skip_next 1
                continue
            end
            # combined short form: -rREV (but not bare -r, already handled)
            if string match -qr -- '^-r.' $arg
                continue
            end
            if string match -q -- '-*' $arg
                continue
            end
            set dest $arg
        end
        if test -z "$dest"
            echo "jjw: destination path required" >&2
            return 1
        end
        JJ_EDITOR=true jj workspace add $argv
        or return 1
    end

    set dest (realpath $dest)
    or return 1

    set -l env_files
    if command -q fd
        set env_files (fd -H -I -t f '^\.env' $src_root -E .git -E .jj -E node_modules)
    else
        set env_files (find $src_root -name '.env*' -not -path '*/.git/*' -not -path '*/.jj/*' -not -path '*/node_modules/*')
    end

    for env_file in $env_files
        set -l rel_path (string replace "$src_root/" '' $env_file)
        set -l dest_path $dest/$rel_path
        mkdir -p (dirname $dest_path)
        ln -sfn $env_file $dest_path
    end

    if command -q direnv; and test -f $dest/.envrc
        direnv allow $dest
    end

    echo $dest
end
