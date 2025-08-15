local M = {}
M.setup = function()
  vim.keymap.set('n', '[GIT]', '<Nop>', { noremap = true })
  vim.keymap.set('n', '<Leader>g', '[GIT]', { remap = true })
  vim.keymap.set('n', '[GIT]s', ':Git<CR><C-w>T', { noremap = true })
  vim.keymap.set('n', '[GIT]a', ':Gwrite<CR>', { noremap = true })
  vim.keymap.set('n', '[GIT]c', ':Git commit -v<CR>', { noremap = true })
  vim.keymap.set('n', '[GIT]b', ':Git blame<CR>', { noremap = true })
  vim.keymap.set('n', '[GIT]d', ':Git difftool<CR>', { noremap = true })
  vim.keymap.set('n', '[GIT]m', ':Gmerge<CR>', { noremap = true })
  vim.keymap.set('n', '[GIT]l', ':Gllog<CR>', { noremap = true })
  vim.keymap.set('n', '[GIT]p', ':Git push<CR>', { noremap = true })
  
  -- fugitiveのデバッグ情報を収集
  vim.api.nvim_create_autocmd({"BufWinLeave", "BufUnload", "BufDelete"}, {
    pattern = {"*.git/COMMIT_EDITMSG", "fugitive://*"},
    callback = function(args)
      vim.notify(string.format("Fugitive buffer event: %s, file: %s", args.event, args.file), vim.log.levels.DEBUG)
    end,
  })
  
  -- コミット完了時のエラーをキャッチ
  vim.api.nvim_create_autocmd("User", {
    pattern = "FugitiveChanged",
    callback = function()
      local ok, err = pcall(function()
        -- fugitiveの状態をチェック
        if vim.g.fugitive_result then
          vim.notify("Fugitive result: " .. vim.inspect(vim.g.fugitive_result), vim.log.levels.DEBUG)
        end
      end)
      if not ok then
        vim.notify("Fugitive error: " .. tostring(err), vim.log.levels.ERROR)
      end
    end,
  })

  -- gitcommitファイルタイプでAIコミットメッセージを自動生成
  vim.api.nvim_create_autocmd("FileType", {
    pattern = "gitcommit",
    callback = function()
      -- gitcommitバッファが開いたら自動的にAIメッセージを生成
      vim.defer_fn(function()
        -- ai-commitコマンドが存在するかチェック
        if vim.fn.executable('ai-commit') == 0 then
          return
        end

        vim.notify('AIコミットメッセージを生成中...', vim.log.levels.INFO)

        -- ai-commitを実行してメッセージを取得
        vim.fn.jobstart({ 'ai-commit', '--message-only' }, {
          stdout_buffered = true,
          on_stdout = function(_, data)
            if data and #data > 0 then
              vim.schedule(function()
                -- 空でない行だけを抽出
                local lines = {}
                for _, line in ipairs(data) do
                  if line ~= "" then
                    table.insert(lines, line)
                  end
                end

                -- メッセージを最初の行に挿入
                if #lines > 0 then
                  table.insert(lines, "")
                  vim.api.nvim_buf_set_lines(0, 0, 1, false, lines)
                  vim.notify('メッセージを挿入', vim.log.levels.INFO)
                end
              end)
            end
          end,
          on_stderr = function(_, data)
            if data and data[1] and data[1] ~= "" then
              vim.schedule(function()
                vim.notify('エラー: ' .. table.concat(data, '\n'), vim.log.levels.ERROR)
              end)
            end
          end,
        })
      end, 100)
    end,
  })
end
return M
