function claude --description 'Claude Code with upgrade check'
    # アップデートチェック
    if brew outdated | grep -q claude
        echo "🔄 Claude Code のアップデートがあります！"
        read -l -P "アップグレードする？ [y/N]: " reply
        if test "$reply" = "y" -o "$reply" = "Y"
            brew upgrade claude
        end
    end
    # 本体を実行
    command claude $argv
end
