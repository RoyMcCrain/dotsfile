local M = {}
--- TailwindCSSクラスを一貫した順序でソートします。
--- この関数は、事前定義された優先順位に従ってTailwindクラスを整理し、
--- スタイルシートをより保守しやすく、読みやすくします。
-- @return nil
M.sort_tailwind_class = function()
  local filetypes = {
    "javascript", "typescript", "vue", "svelte",
    "typescript", "javascriptreact", "typescriptreact"
  }
  local buf_filetype = vim.api.nvim_get_option_value('filetype', { buf = 0 })
  local file_path = vim.fn.expand('%:p')
  for _, filetype in pairs(filetypes) do
    if buf_filetype == filetype then
      local cmd
      if vim.fn.executable("npx") == 1 then
        cmd = 'npx rustywind --write ' .. vim.fn.shellescape(file_path)
      else
        vim.api.nvim_err_writeln("エラー: npxが利用できません。")
        return
      end

      local output = vim.fn.system(cmd)
      local exit_code = vim.v.shell_error

      if exit_code == 0 then
        vim.cmd('e') -- ファイルを再読み込み
        vim.notify("RustywindによるTailwindCSSのソートが完了しました。")
      else
        vim.api.nvim_err_writeln("エラー: TailwindCSSのソートに失敗しました。")
        vim.api.nvim_err_writeln(output)
      end
      return
    end
  end
  vim.notify("現在のファイルタイプはTailwindCSSのソートはサポートされていません。")
end

-- prettierフォーマッタを使用してコードフォーマットを実行します
-- 現在のバッファに対してprettierフォーマットをトリガーする関数
-- 通常、コードフォーマット用のキーマッピングまたはautocommandで呼び出されます
-- @return nil
M.pritter = function()
  local filetypes = {
    "css", "scss", "html", "markdown", "javascript", "json", "yaml", "typescript", "vue", "svelte", "graphql", "php",
    "typescript", "javascriptreact", "typescriptreact"
  }

  local buf_filetype = vim.api.nvim_get_option_value('filetype', { buf = 0 })
  local file_path = vim.fn.expand('%:p')
  local function file_exists(path)
    local f = io.open(path, "r")
    if f then
      io.close(f)
      return true
    else
      return false
    end
  end

  for _, filetype in pairs(filetypes) do
    if buf_filetype == filetype then
      local cmd
      if vim.fn.executable("yarn") == 1 and file_exists(vim.fn.getcwd() .. "/yarn.lock") then
        cmd = 'yarn run prettier --cache --write ' .. vim.fn.shellescape(file_path)
      elseif vim.fn.executable("npx") == 1 then
        cmd = 'npx prettier --cache --write ' .. vim.fn.shellescape(file_path)
      else
        vim.api.nvim_err_writeln("エラー: npxが利用できません。")
        return
      end

      local output = vim.fn.system(cmd)
      local exit_code = vim.v.shell_error

      if exit_code == 0 then
        vim.cmd('e') -- ファイルを再読み込み
        vim.notify("Prettierによるフォーマットが完了しました。")
      else
        vim.api.nvim_err_writeln("エラー: Prettierのフォーマットに失敗しました。")
        vim.api.nvim_err_writeln(output)
      end
      return
    end
  end
  vim.notify("現在のファイルタイプはPrettierでサポートされていません。")
end

-- ファイル保存時にeslintによるフォーマットを実行する
--- @return nil
M.toggle_terminal = function()
  if vim.bo.buftype == 'terminal' then
    -- ターミナルから元のバッファに戻る
    vim.cmd('buffer #')
  else
    -- すでに開いているターミナルバッファがあるか確認
    local found = false
    for _, buf in ipairs(vim.api.nvim_list_bufs()) do
      if vim.bo[buf].buftype == 'terminal' then
        vim.api.nvim_set_current_buf(buf)
        found = true
        break
      end
    end
    -- ターミナルバッファがない場合、新しいターミナルを開く
    if not found then
      vim.cmd('terminal')
    end
  end
end

--- 現在のプロジェクトに対してyarn lintコマンドを実行します。
-- この関数はpackage.jsonで定義されたyarn lintスクリプトを実行します。
-- @return nil
M.yarn_lint = function()
  local file_path = vim.fn.expand('%:p')
  local cmd = 'yarn lint --fix ' .. vim.fn.shellescape(file_path)
  local output = vim.fn.system(cmd)
  local exit_code = vim.v.shell_error

  if exit_code == 0 then
    vim.cmd('e') -- ファイルを再読み込み
    print("eslintによるフォーマットが完了しました。")
  else
    vim.api.nvim_err_writeln("エラー: eslintのフォーマットに失敗しました。")
    vim.api.nvim_err_writeln(output)
  end
end

return M
