function __keychain_command -a item key --description 'private: emit one security -i add-generic-password line'
    set -lu fish_trace

    if test (count $argv) -ne 2
        return 2
    end

    if test -z "$USER"; or string match -qr '[[:cntrl:]]' -- "$USER"
        return 2
    end

    if test -z "$item"; or string match -qr '[[:cntrl:]]' -- "$item"
        return 2
    end

    if test -z "$key"; or string match -qr '[[:cntrl:]]' -- "$key"
        return 3
    end

    set -l enc_item "$item"
    set enc_item (string replace -a '\\' '\\\\' -- $enc_item)
    set enc_item (string replace -a '"' '\\"' -- $enc_item)
    set enc_item "\"$enc_item\""

    set -l enc_user "$USER"
    set enc_user (string replace -a '\\' '\\\\' -- $enc_user)
    set enc_user (string replace -a '"' '\\"' -- $enc_user)
    set enc_user "\"$enc_user\""

    set -l enc_key "$key"
    set enc_key (string replace -a '\\' '\\\\' -- $enc_key)
    set enc_key (string replace -a '"' '\\"' -- $enc_key)
    set enc_key "\"$enc_key\""

    set -l line "add-generic-password -U -s $enc_item -a $enc_user -w $enc_key"
    set -l line_bytes (printf '%s' "$line" | wc -c | string trim)
    if test "$line_bytes" -gt 4000
        return 4
    end

    printf '%s' "$line"
    return 0
end
