function jj-switch --description 'Switch bookmark with fzf (Enter=edit, Ctrl-N=new)'
    if not test -d .jj
        echo "Error: Not a jj repository" >&2
        return 1
    end

    set -l bookmarks (jj bookmark list --tracked -T 'name ++ "\n"' 2>/dev/null)
    if test -z "$bookmarks"
        echo "Error: ブックマークがありません" >&2
        return 1
    end

    set -l result (printf '%s\n' $bookmarks | sort -u | fzf \
        --header 'Enter: edit / Ctrl-N: new' \
        --expect 'ctrl-n' \
        --preview 'echo "── Commits ──"; jj log -r "trunk()..{1}" 2>&1; echo ""; echo "── Files ──"; jj diff -r "trunk()..{1}" --stat 2>&1' \
        --preview-window 'right:60%')

    test -z "$result"; and return

    set -l key $result[1]
    set -l bookmark $result[2]

    test -z "$bookmark"; and return

    if test "$key" = ctrl-n
        JJ_EDITOR=true jj new "$bookmark"
        echo "jj new $bookmark"
    else
        JJ_EDITOR=true jj edit "$bookmark"
        echo "jj edit $bookmark"
    end

    jj log -r @ --no-graph
end
