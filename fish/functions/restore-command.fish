function restore-command --description 'Restore saved command from fancy-ctrl-z'
    if set -q saved_commandline
        commandline $saved_commandline
        set -e saved_commandline
        echo "Command restored!"
    else
        echo "No saved command"
    end
end
