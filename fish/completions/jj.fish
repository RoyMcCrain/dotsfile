# jj git push -b のbookmark名補完
complete -c jj -n '__fish_seen_subcommand_from git; and __fish_seen_subcommand_from push; and __fish_contains_opt -s b bookmark' -xa '(jj bookmark list -T "name ++ \"\n\"" 2>/dev/null | sort -u)'

# jj-push のbookmark名補完
complete -c jj-push -xa '(jj bookmark list -T "name ++ \"\n\"" 2>/dev/null | sort -u)'
