function arto --description 'Open Arto markdown viewer'
    if not test -d /Applications/Arto.app
        echo "Arto is not installed"
        return 1
    end
    open -a Arto $argv
end
