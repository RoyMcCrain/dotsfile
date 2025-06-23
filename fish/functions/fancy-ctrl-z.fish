function fancy-ctrl-z --description 'Smart Ctrl+Z: resume vim if no command, suspend if typing'
    # コマンドラインが空の場合
    if test (string length (commandline)) -eq 0
        # バックグラウンドジョブがあるかチェック
        set -l job_count (jobs | wc -l)
        if test $job_count -gt 0
            # 最新のジョブをフォアグラウンドに戻す
            fg
        else
            # ジョブがない場合は何もしない
            echo "No background jobs"
        end
    else
        # コマンドラインに何か入力されている場合は、入力を保存してクリア
        set -g saved_commandline (commandline)
        commandline ""
        commandline -f repaint
        echo "Command saved: $saved_commandline"
    end
end
