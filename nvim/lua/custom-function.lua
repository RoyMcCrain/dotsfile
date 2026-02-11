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

-- Terminalをfloat windowでtoggle
--- @return nil
M.toggle_terminal = function()
  -- 現在のウィンドウがターミナルのフロートウィンドウかチェック
  local current_win = vim.api.nvim_get_current_win()
  local current_buf = vim.api.nvim_win_get_buf(current_win)
  local config = vim.api.nvim_win_get_config(current_win)

  local function is_ai_agent_buf(buf)
    local ok, v = pcall(vim.api.nvim_buf_get_var, buf, 'ai_agent_term')
    return ok and v == true
  end

  -- 現在のウィンドウがフロートターミナルなら閉じる
  if vim.bo[current_buf].buftype == 'terminal' and config.relative ~= '' and not is_ai_agent_buf(current_buf) then
    local bufname = vim.api.nvim_buf_get_name(current_buf)
    if not string.match(bufname:lower(), "claude") then
      vim.api.nvim_win_close(current_win, true)
      return
    end
  end

  -- フロートウィンドウで開いているターミナルを探す
  local term_win = nil
  local term_buf = nil
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    local buf = vim.api.nvim_win_get_buf(win)
    if vim.bo[buf].buftype == 'terminal' and not is_ai_agent_buf(buf) then
      local bufname = vim.api.nvim_buf_get_name(buf)
      if not string.match(bufname:lower(), "claude") then
        local win_config = vim.api.nvim_win_get_config(win)
        if win_config.relative ~= '' then -- フロートウィンドウかチェック
          term_win = win
          term_buf = buf
          break
        end
      end
    end
  end

  if term_win then
    -- 既存のターミナルウィンドウにフォーカスを移す
    vim.api.nvim_set_current_win(term_win)
    vim.cmd('startinsert')
  else
    -- フロートウィンドウでターミナルを開く
    local width = math.floor(vim.o.columns * 0.3) -- 画面幅の30%
    local height = vim.o.lines - 4                -- 縦はほぼフルサイズ（ステータスライン分を引く）
    local col = vim.o.columns - width             -- 右端に配置
    local row = 1                                 -- 上端から開始

    -- 既存のターミナルバッファを探す（フロートウィンドウではないもの）
    if not term_buf then
      for _, buf in ipairs(vim.api.nvim_list_bufs()) do
        if vim.bo[buf].buftype == 'terminal' and vim.api.nvim_buf_is_valid(buf) and not is_ai_agent_buf(buf) then
          local bufname = vim.api.nvim_buf_get_name(buf)
          if not string.match(bufname:lower(), "claude") then
            -- このバッファが現在表示されていないことを確認
            local is_displayed = false
            for _, win in ipairs(vim.api.nvim_list_wins()) do
              if vim.api.nvim_win_get_buf(win) == buf then
                is_displayed = true
                break
              end
            end
            if not is_displayed then
              term_buf = buf
              break
            end
          end
        end
      end
    end

    -- ターミナルバッファがなければ新規作成
    if not term_buf then
      term_buf = vim.api.nvim_create_buf(false, true)
    end

    -- フロートウィンドウを作成
    local win = vim.api.nvim_open_win(term_buf, true, {
      relative = 'editor',
      width = width,
      height = height,
      col = col,
      row = row,
      style = 'minimal',
      border = 'rounded',
    })

    -- 新規バッファの場合はターミナルを開く
    if vim.bo[term_buf].buftype ~= 'terminal' then
      vim.fn.termopen(vim.o.shell)
    end

    -- ターミナルモードに入る
    vim.cmd('startinsert')
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
    path = vim.fn.expand('%:p') -- デフォルトは絶対パス
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

-- ターミナルに現在のファイルの相対パスを追加
-- @return nil
M.term_put_relpath = function(prefix)
  local path = vim.fn.expand('%')

  -- 既に端末上でなければ端末を開いてフォーカス
  if vim.bo.buftype ~= 'terminal' then
    M.toggle_terminal()
  end

  -- 送る文字列（デフォルトはスペース接頭）
  local p = prefix
  if p == nil or p == '' then
    p = ' '
  end

  -- 現在の端末ジョブに文字列を送信（改行なしで追加）
  local job = vim.b.terminal_job_id
  if job then
    vim.fn.chansend(job, p .. path)
  end
end

-- AI Agent用ターミナルに相対パスを追加
M.term_put_relpath_ai_agent = function()
  local function current_is_ai_agent()
    local buf = vim.api.nvim_get_current_buf()
    local cfg = vim.api.nvim_win_get_config(0)
    if vim.bo.buftype ~= 'terminal' or cfg.relative == '' then
      return false
    end
    local ok, v = pcall(vim.api.nvim_buf_get_var, buf, 'ai_agent_term')
    return ok and v == true
  end

  local function get_relpath()
    local name = vim.api.nvim_buf_get_name(0)
    if vim.bo.buftype ~= 'terminal' and name ~= '' and not name:match('^term://') then
      return vim.fn.fnamemodify(name, ':.')
    end
    local alt = vim.fn.expand('#')
    if alt ~= '' then
      return vim.fn.fnamemodify(alt, ':.')
    end
    return ''
  end

  local path = get_relpath()
  if path == '' then
    vim.notify('送信できるファイルパスがありません', vim.log.levels.WARN)
    return
  end

  if not current_is_ai_agent() then
    M.toggle_ai_agent_terminal()
  end

  vim.defer_fn(function()
    local job = vim.b.terminal_job_id
    if job then
      vim.fn.chansend(job, '@' .. path)
    end
  end, 120)
end

-- 通常ターミナルに相対パスを追加（AI Agent端末にいても通常端末へ）
M.term_put_relpath_normal = function()
  local function current_is_ai_agent()
    local buf = vim.api.nvim_get_current_buf()
    local cfg = vim.api.nvim_win_get_config(0)
    if vim.bo.buftype ~= 'terminal' or cfg.relative == '' then
      return false
    end
    local ok, v = pcall(vim.api.nvim_buf_get_var, buf, 'ai_agent_term')
    return ok and v == true
  end

  local function get_relpath()
    local name = vim.api.nvim_buf_get_name(0)
    if vim.bo.buftype ~= 'terminal' and name ~= '' and not name:match('^term://') then
      return vim.fn.fnamemodify(name, ':.')
    end
    local alt = vim.fn.expand('#')
    if alt ~= '' then
      return vim.fn.fnamemodify(alt, ':.')
    end
    return ''
  end

  local path = get_relpath()
  if path == '' then
    vim.notify('送信できるファイルパスがありません', vim.log.levels.WARN)
    return
  end

  if vim.bo.buftype ~= 'terminal' or current_is_ai_agent() then
    M.toggle_terminal()
  end

  vim.defer_fn(function()
    local job = vim.b.terminal_job_id
    if job then
      vim.fn.chansend(job, ' ' .. path)
    end
  end, 80)
end

-- AI Agent用ターミナルトグル（右側フロート）
-- <C-g> で開閉。開いたら claude コマンドを起動する
M.toggle_ai_agent_terminal = function()
  local current_win = vim.api.nvim_get_current_win()
  local current_buf = vim.api.nvim_win_get_buf(current_win)
  local cfg = vim.api.nvim_win_get_config(current_win)

  local function is_ai_agent_buf(buf)
    local ok, v = pcall(vim.api.nvim_buf_get_var, buf, 'ai_agent_term')
    return ok and v == true
  end

  if vim.bo[current_buf].buftype == 'terminal' and cfg.relative ~= '' and is_ai_agent_buf(current_buf) then
    vim.api.nvim_win_close(current_win, true)
    return
  end

  local term_win, term_buf
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    local buf = vim.api.nvim_win_get_buf(win)
    if vim.bo[buf].buftype == 'terminal' and is_ai_agent_buf(buf) then
      local wcfg = vim.api.nvim_win_get_config(win)
      if wcfg.relative ~= '' then
        term_win = win
        term_buf = buf
        break
      end
    end
  end

  if term_win then
    vim.api.nvim_set_current_win(term_win)
    vim.cmd('startinsert')
    return
  end

  if not term_buf then
    for _, buf in ipairs(vim.api.nvim_list_bufs()) do
      if vim.api.nvim_buf_is_valid(buf) and vim.bo[buf].buftype == 'terminal' and is_ai_agent_buf(buf) then
        -- 非表示の AI Agent ターミナルを再利用
        local displayed = false
        for _, win in ipairs(vim.api.nvim_list_wins()) do
          if vim.api.nvim_win_get_buf(win) == buf then
            displayed = true
            break
          end
        end
        if not displayed then
          term_buf = buf
          break
        end
      end
    end
  end

  local width = math.floor(vim.o.columns * 0.3)
  local height = vim.o.lines - 4
  local col = vim.o.columns - width
  local row = 1

  if not term_buf then
    term_buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_var(term_buf, 'ai_agent_term', true)
  end

  local win = vim.api.nvim_open_win(term_buf, true, {
    relative = 'editor',
    width = width,
    height = height,
    col = col,
    row = row,
    style = 'minimal',
    border = 'rounded',
  })

  if vim.bo[term_buf].buftype ~= 'terminal' then
    local job = vim.fn.termopen(vim.o.shell)
    vim.defer_fn(function()
      if job then
        vim.fn.chansend(job, 'claude\n')
      end
    end, 50)
  end

  vim.api.nvim_set_current_win(win)
  vim.cmd('startinsert')
end

return M
