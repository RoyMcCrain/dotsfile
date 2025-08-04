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

  -- gitcommitファイルタイプで:Aiコマンドを定義
  vim.api.nvim_create_autocmd("FileType", {
    pattern = "gitcommit",
    callback = function()
      vim.api.nvim_buf_create_user_command(0, 'Ai', function()
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
      end, { desc = 'Insert AI commit message' })
    end,
  })
end
return M
