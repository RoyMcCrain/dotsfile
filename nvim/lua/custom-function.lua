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


-- 現在開いているファイルを非同期にVisual Studio Codeで開きます。
-- @return nil
M.open_in_code = function()
  local file_path = vim.fn.expand('%:p')
  local line = vim.fn.line('.')
  local col = vim.fn.col('.')
  vim.notify(string.format("VSCodeでファイルを開きます: %s:%d:%d", file_path, line, col))
  -- 非同期でVSCodeを開く
  vim.fn.jobstart({
    "code", "--goto", string.format("%s:%d:%d", file_path, line, col),
  }, {
    on_exit = function(_, code)
      if code ~= 0 then
        vim.notify("VSCodeの起動に失敗しました", vim.log.levels.ERROR)
      else
        vim.notify("VSCodeでファイルを開きました")
      end
    end,
  })
end

-- 現在のファイルパスをクリップボードにコピーする関数
-- 絶対パス、相対パス、ファイル名のみの3種類のコピー方法を提供
-- @param mode string - "absolute" (絶対パス), "relative" (相対パス), "filename" (ファイル名のみ)
-- @return nil
M.copy_file_path = function(mode)
  local path
  if mode == "absolute" then
    path = vim.fn.expand('%:p')
  elseif mode == "relative" then
    path = vim.fn.expand('%')
  elseif mode == "filename" then
    path = vim.fn.expand('%:t')
  else
    path = vim.fn.expand('%:p')  -- デフォルトは絶対パス
  end
  
  -- クリップボードにコピー
  vim.fn.setreg('+', path)
  vim.notify(string.format("Copied to clipboard: %s", path))
end

-- DenoでJSONをフォーマットする関数
-- バッファ全体またはビジュアル選択範囲のJSONをフォーマットします
-- @return nil
M.format_json_with_deno = function()
  -- ビジュアルモードでの選択範囲を取得
  local start_line, end_line
  local mode = vim.api.nvim_get_mode().mode

  if mode == 'v' or mode == 'V' then
    -- ビジュアルモードの場合、選択範囲を取得
    start_line = vim.fn.line("'<")
    end_line = vim.fn.line("'>")
  else
    -- 通常モードの場合、バッファ全体を対象とする
    start_line = 1
    end_line = vim.fn.line('$')
  end

  -- 対象範囲のテキストを取得
  local lines = vim.api.nvim_buf_get_lines(0, start_line - 1, end_line, false)
  local content = table.concat(lines, '\n')

  -- Denoでフォーマット
  local cmd = { 'deno', 'fmt', '--no-config', '--ext', 'json', '-' }
  local result = vim.system(cmd, {
    stdin = content,
    text = true,
  }):wait()

  if result.code == 0 then
    -- フォーマット成功
    local formatted_lines = vim.split(result.stdout, '\n')
    -- 末尾の空行を削除
    if formatted_lines[#formatted_lines] == '' then
      table.remove(formatted_lines)
    end
    -- バッファを更新
    vim.api.nvim_buf_set_lines(0, start_line - 1, end_line, false, formatted_lines)
    vim.notify('JSONのフォーマットが完了しました')
  else
    -- エラーの場合
    vim.notify('JSONフォーマットエラー: ' .. (result.stderr or 'Unknown error'), vim.log.levels.ERROR)
  end
end

return M
