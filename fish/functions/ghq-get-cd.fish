function ghq-get-cd --description 'Clone repository with ghq and cd into it'
    if test (count $argv) -eq 0
        echo "Usage: ghq-get-cd <repository>"
        return 1
    end
    
    ghq get $argv[1]
    and cd (ghq list --exact --full-path $argv[1])
end
