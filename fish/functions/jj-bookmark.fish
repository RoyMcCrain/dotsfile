function jj-bookmark --description 'Create bookmark from commit message'
    if not test -d .jj
        echo "Error: Not a jj repository" >&2
        return 1
    end

    set -l bookmark $argv[1]

    # 引数なし: LM Studioでbookmark名を自動生成
    if test -z "$bookmark"
        set -l desc (jj log -r @ --no-graph -T 'description' 2>/dev/null | head -1 | string trim)
        if test -z "$desc"
            echo "Error: コミットメッセージがありません。先に jj describe してください。" >&2
            return 1
        end

        # LM Studioが起動しているか確認
        if curl -s --connect-timeout 1 --max-time 2 http://localhost:1234/v1/models >/dev/null 2>&1
            set -l payload (echo '{}' | jq -n \
                --arg model "google/gemma-4-26b-a4b" \
                --arg desc "$desc" \
                '{
                    model: $model,
                    messages: [{
                        role: "user",
                        content: ("Generate a git branch name from this commit message. Output ONLY the branch name. Use format: type/short-description (e.g. feat/add-user-auth). Use lowercase, hyphens, no spaces. Max 50 chars. Commit: " + $desc)
                    }],
                    temperature: 0.1,
                    max_tokens: 200
                }')
            set -l result (curl -s -X POST http://localhost:1234/v1/chat/completions \
                -H "Content-Type: application/json" \
                -d "$payload" | tr -d '\000-\010\013\014\016-\037' | jq -r '.choices[0].message.content // empty' | string trim | head -1)

            if test -n "$result"
                set bookmark $result
            end
        end

        # LM Studio失敗時はローカルで生成
        if test -z "$bookmark"
            set bookmark (echo "$desc" | sed 's/: /\//' | sed 's/ /-/g' | sed 's/[^a-zA-Z0-9\/_-]//g' | string lower | string sub -l 50)
        end
    end

    jj bookmark set "$bookmark" -r @
    echo "bookmark作成: $bookmark"
    jj log -r @ --no-graph
end
