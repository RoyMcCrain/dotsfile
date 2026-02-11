function fish_user_key_bindings --description 'Set custom key bindings and keep fzf integration'
    # Start from the user-selected base bindings (default or vi)
    if set -q fish_key_bindings
        eval $fish_key_bindings
    else
        fish_default_key_bindings
    end

    # Re-apply fzf-provided bindings so built-in widgets stay available
    if functions -q fzf_key_bindings
        fzf_key_bindings
    end

    # ghq-fzf: Ctrl+S (BEAKL: sはホームロー下方向)
    if functions -q ghq-fzf
        bind \cs ghq-fzf
        bind -M insert \cs ghq-fzf
    end

    # ghq-fzf-jj: Ctrl+T (BEAKL: tはホームロー上方向)
    if functions -q ghq-fzf-jj
        bind \ct ghq-fzf-jj
        bind -M insert \ct ghq-fzf-jj
    end

    # fzf-file-widget: Ctrl+G
    if functions -q fzf-file-widget
        bind \cg fzf-file-widget
        bind -M insert \cg fzf-file-widget
    end

    if functions -q fancy-ctrl-z
        bind \cz fancy-ctrl-z
        bind -M insert \cz fancy-ctrl-z
    end
end
