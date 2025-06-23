# ghq補完設定
complete -c ghq-cd -a '(ghq list)' --description 'Repository'
complete -c ghq-get-cd -a '(ghq list)' --description 'Repository'

# ghq自体の補完も追加
complete -c ghq -n '__fish_use_subcommand' -a 'get' --description 'Clone repository'
complete -c ghq -n '__fish_use_subcommand' -a 'list' --description 'List repositories'
complete -c ghq -n '__fish_use_subcommand' -a 'look' --description 'Look into repository'
complete -c ghq -n '__fish_use_subcommand' -a 'import' --description 'Import repositories'
complete -c ghq -n '__fish_use_subcommand' -a 'root' --description 'Show root directory'

# ghq listの補完
complete -c ghq -n '__fish_seen_subcommand_from look' -a '(ghq list)' --description 'Repository'
