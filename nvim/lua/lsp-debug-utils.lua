-- LSPデバッグユーティリティモジュール
local M = {}

-- LSPメソッドを実行してその結果を新しいバッファに表示
M.execute_lsp_method = function(method, params, timeout_ms)
  timeout_ms = timeout_ms or 3000
  params = params or vim.lsp.util.make_range_params()

  -- 現在のバッファ番号を取得
  local current_bufnr = vim.api.nvim_get_current_buf()

  -- アクティブなLSPクライアントを取得
  local clients = vim.lsp.get_active_clients({ bufnr = current_bufnr })

  -- 結果を格納するためのテーブル
  local results = {
    timestamp = os.date("%Y-%m-%d %H:%M:%S"),
    method = method,
    params = params,
    file = vim.fn.expand('%:p'),
    clients = {}
  }

  -- クライアント情報を収集
  for _, client in ipairs(clients) do
    results.clients[client.id] = {
      name = client.name,
      id = client.id,
      offset_encoding = client.offset_encoding,
      root_dir = client.config.root_dir,
      capabilities = client.server_capabilities
    }
  end

  -- LSPリクエストを実行
  local lsp_results = vim.lsp.buf_request_sync(current_bufnr, method, params, timeout_ms)
  results.results = lsp_results

  -- 新しいバッファを作成して結果を表示
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_option(buf, 'filetype', 'lua')

  -- 結果をフォーマットして表示
  local formatted_result = vim.inspect(results)
  local lines = vim.split(formatted_result, '\n')
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)

  -- 新しいウィンドウでバッファを表示
  vim.api.nvim_command('vsplit')
  vim.api.nvim_win_set_buf(0, buf)

  return results
end

-- 結果をクリップボードにコピー
M.copy_to_clipboard = function(data)
  local text = type(data) == "string" and data or vim.inspect(data)
  vim.fn.setreg('+', text)
  vim.notify("クリップボードにコピーしました", vim.log.levels.INFO)
end

-- LSPのログレベルを一時的に変更して操作を実行
M.with_debug_log = function(callback)
  local original_log_level = vim.lsp.get_log_level()
  vim.lsp.set_log_level("debug")

  vim.notify("LSPデバッグログを有効化しました: " .. vim.lsp.get_log_path(), vim.log.levels.INFO)

  local result = callback()

  vim.lsp.set_log_level(original_log_level)
  vim.notify("LSPログレベルを元に戻しました", vim.log.levels.INFO)

  return result
end

-- 特定のLSPクライアントのみを使用してメソッドを実行
M.execute_for_client = function(client_name, method, params, timeout_ms)
  timeout_ms = timeout_ms or 3000
  params = params or vim.lsp.util.make_range_params()

  local bufnr = vim.api.nvim_get_current_buf()
  local clients = vim.lsp.get_active_clients({ bufnr = bufnr, name = client_name })

  if #clients == 0 then
    vim.notify(client_name .. " LSPクライアントが見つかりません", vim.log.levels.WARN)
    return nil
  end

  local client_id = clients[1].id
  local result = vim.lsp.buf_request_sync(bufnr, method, params, timeout_ms, client_id)

  return result
end

-- コードアクションのテスト用関数
M.test_code_action = function(action_kind, client_name)
  local params = vim.lsp.util.make_range_params()
  params.context = { only = { action_kind }, diagnostics = {} }

  if client_name then
    return M.execute_for_client(client_name, "textDocument/codeAction", params)
  else
    return M.execute_lsp_method("textDocument/codeAction", params)
  end
end

-- ユーザーコマンドを登録
local function register_commands()
  vim.api.nvim_create_user_command("LspDebugMethod", function(opts)
    local method = opts.args
    if method == "" then
      vim.ui.select(
        {
          "textDocument/codeAction",
          "textDocument/formatting",
          "textDocument/definition",
          "textDocument/references",
          "textDocument/hover",
          "textDocument/implementation",
          "textDocument/documentSymbol"
        },
        { prompt = "LSPメソッドを選択:" },
        function(selected)
          if selected then M.execute_lsp_method(selected) end
        end
      )
    else
      M.execute_lsp_method(method)
    end
  end, { nargs = "?", desc = "指定されたLSPメソッドを実行し結果を表示" })

  vim.api.nvim_create_user_command("LspTestCodeAction", function(opts)
    M.test_code_action(opts.args)
  end, { nargs = "?", desc = "コードアクションのテスト" })

  vim.api.nvim_create_user_command("LspDebugClients", function()
    local bufnr = vim.api.nvim_get_current_buf()
    local clients = vim.lsp.get_active_clients({ bufnr = bufnr })
    M.execute_lsp_method("", {}) -- 空のメソッドでクライアント情報だけ表示
  end, { desc = "現在のバッファに接続されているLSPクライアントを表示" })
end

register_commands()

return M
