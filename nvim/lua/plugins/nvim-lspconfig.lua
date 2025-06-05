-- lsp.lua (ファイル名を仮定)
local M = {}

M.setup = function()
  -- 基本設定
  vim.keymap.set('n', '[LSP]', '<Nop>', { noremap = true })
  vim.keymap.set('n', 'l', '[LSP]', { remap = true, desc = 'LSP' })

  -- 必要なモジュールをロード
  local lu = require('lsp-utils') -- lsp-utils が必要ならそのまま
  local lspconfig = require('lspconfig')
  local navic = require('nvim-navic')
  -- require('lsp-debug-utils') -- デバッグが必要ならコメント解除

  -- 共通の capabilities を作成
  -- Neovim 0.10+ 標準の方法をベースにするのがおすすめっス
  local capabilities = vim.lsp.protocol.make_client_capabilities()
  -- ddc-source-lsp の capabilities をマージ
  capabilities = vim.tbl_deep_extend('force', capabilities, require('ddc_source_lsp').make_client_capabilities())

  ----------------------------------------------------------------------
  -- 共通の on_attach 関数 (キーマップと navic のアタッチなど)
  ----------------------------------------------------------------------
  local base_on_attach = function(client, bufnr)
    -- バッファローカルオプション
    local opts = { noremap = true, silent = true, buffer = bufnr }

    -- キーマップ設定 (desc を opts に含めるように少し変更)
    vim.keymap.set('n', '[LSP]a', '<Cmd>lua vim.lsp.buf.code_action()<CR>',
      vim.tbl_extend('force', { desc = "Code Action" }, opts))
    vim.keymap.set('n', '[LSP]D', '<Cmd>lua vim.lsp.buf.definition()<CR>', vim.tbl_extend('force', { desc = "定義" }, opts))
    vim.keymap.set('n', '[LSP]T', '<Cmd>lua vim.lsp.buf.type_definition()<CR>',
      vim.tbl_extend('force', { desc = "型定義" }, opts))
    vim.keymap.set('n', '[LSP]r', '<Cmd>lua vim.lsp.buf.references()<CR>', vim.tbl_extend('force', { desc = "参照" }, opts))
    vim.keymap.set('n', '[LSP]R', '<Cmd>lua vim.lsp.buf.rename()<CR>', vim.tbl_extend('force', { desc = "リネーム" }, opts))
    vim.keymap.set('n', '[LSP]w', '<Cmd>lua vim.lsp.buf.workspace_symbol()<CR>',
      vim.tbl_extend('force', { desc = "ワークスペースで検索" }, opts))
    vim.keymap.set('n', '[LSP]I', '<Cmd>lua vim.lsp.buf.implementation()<CR>',
      vim.tbl_extend('force', { desc = "実装" }, opts))
    vim.keymap.set('n', '[LSP]d', '<Cmd>lua vim.lsp.buf.document_symbol()<CR>',
      vim.tbl_extend('force', { desc = "今開いているファイルから検索" }, opts))
    vim.keymap.set('n', '[LSP]k', '<Cmd>lua vim.diagnostic.goto_prev()<CR>',
      vim.tbl_extend('force', { desc = "前のエラーへ移動" }, opts))
    vim.keymap.set('n', '[LSP]s', '<Cmd>lua vim.diagnostic.goto_next()<CR>',
      vim.tbl_extend('force', { desc = "次のエラーへ移動" }, opts))
    vim.keymap.set('n', '[LSP]l', '<Cmd>lua vim.diagnostic.setloclist()<CR>',
      vim.tbl_extend('force', { desc = "診断情報一覧" }, opts))
    vim.keymap.set('n', 'H', '<Cmd>lua vim.lsp.buf.hover()<CR>', vim.tbl_extend('force', { desc = "ホバー" }, opts))

    -- nvim-navic のアタッチ (必要ならコメント解除！)
    -- navic が documentSymbolProvider をサポートしているか確認
    if client.server_capabilities.documentSymbolProvider then
      navic.attach(client, bufnr)
    end

    -- 注意: ここでは Autocmd を定義しない！
    -- Autocmd は下のサーバー設定で必要に応じてバッファローカルに定義するか、
    -- グローバルなものは M.setup の外側などで一度だけ定義します。
  end

  ----------------------------------------------------------------------
  -- グローバルな Autocmd
  ----------------------------------------------------------------------
  local format_augroup = vim.api.nvim_create_augroup("GlobalFormatOnSave", { clear = true })
  vim.api.nvim_create_autocmd("BufWritePre", {
    pattern = "*", -- 対象ファイルを指定
    group = format_augroup,
    callback = lu.format_on_save,
    desc = "Format on save using lsp-utils",
  })

  ----------------------------------------------------------------------
  -- LSP サーバー設定
  ----------------------------------------------------------------------

  -- 共通設定を使うサーバーリスト
  local common_servers = {
    "cssls",
    "stylelint_lsp",
    "rust_analyzer",
    "lua_ls",
    "pyright",
    "graphql", -- root_dir は後で追加
    "rubocop",
    "ruby_lsp",
    "yamlls", -- settings は後で追加
    "vimls",
    "protols",
    "sqls", -- cmd は後で追加
  }

  for _, server_name in ipairs(common_servers) do
    local server_opts = {
      capabilities = capabilities,
      on_attach = base_on_attach, -- 共通の on_attach を使用
    }

    -- サーバー固有の設定を追加
    if server_name == "yamlls" then
      server_opts.settings = {
        yaml = { schemas = { ["https://json.schemastore.org/github-workflow.json"] = "/.github/workflows/*" } },
      }
    elseif server_name == "graphql" then
      server_opts.root_dir = function(fname)
        return lu.find_nearest_file(fname,
          { '.graphqlrc*', '.graphql.config.*', 'graphql.config.*' })
      end
    elseif server_name == "sqls" then
      server_opts.cmd = { "sqls", "-config", "~/.config/sqls/config.yml" }
    end
    -- 他にもあればここに追加...

    lspconfig[server_name].setup(server_opts)
  end

  -- 個別の設定が必要なサーバー
  -- シンプルなvtsls設定
  lspconfig.vtsls.setup {
    capabilities = capabilities,
    on_attach = function(client, bufnr)
      base_on_attach(client, bufnr) -- 共通処理を呼び出し

      -- vtsls 固有処理: Deno プロジェクトなら停止
      if lu.is_find_nearest_file(vim.api.nvim_buf_get_name(bufnr), { "deno.json", "deno.jsonc" }) then
        pcall(client.stop)
      end
    end,
    root_dir = function(fname)
      return lu.find_nearest_file(fname, { 'tsconfig.json', 'jsconfig.json', 'package.json' })
    end,
    filetypes = { "typescript", "javascript", "typescriptreact", "javascriptreact" },

    -- シンプルな設定（必要最小限）
    settings = {
      vtsls = {
        autoUseWorkspaceTsdk = true, -- ワークスペースのTypeScriptを自動使用
      },
      typescript = {
        suggest = {
          includeCompletionsForImportStatements = true,
          autoImports = "on",
        },
        preferences = {
          includePackageJsonAutoImports = "on",
        },
      },
      javascript = {
        suggest = {
          includeCompletionsForImportStatements = true,
          autoImports = "on",
        },
        preferences = {
          includePackageJsonAutoImports = "on",
        },
      },
    },
  }

  -- biome
  lspconfig.biome.setup {
    capabilities = capabilities,
    root_dir = function(fname) return lu.find_nearest_file(fname, 'biome.json') end,
    on_attach = function(client, bufnr)
      -- Biome ではフォーマットを優先し、補完を無効化
      client.server_capabilities.documentFormattingProvider = true
      client.server_capabilities.completionProvider = false

      base_on_attach(client, bufnr) -- 共通処理を呼び出し

      -- biome 固有処理: organizeImports の Autocmd (バッファローカルで定義)
      local biome_augroup = vim.api.nvim_create_augroup("BiomeOrganizeImports_" .. bufnr, { clear = true })
      vim.api.nvim_create_autocmd("BufWritePre", {
        buffer = bufnr, -- バッファローカル！
        group = biome_augroup,
        callback = function()
          local range_params = vim.lsp.util.make_range_params(0, "utf-8")
          local params = {
            textDocument = range_params.textDocument,
            range = range_params.range,
            context = { only = { "source.organizeImports.biome" }, diagnostics = {} }
          }

          -- 非同期版に変更（UIブロックを回避）
          vim.lsp.buf_request(bufnr, "textDocument/codeAction", params, function(err, result)
            if err then
              vim.notify("Biome organize imports failed: " .. err.message, vim.log.levels.WARN)
              return
            end

            if not result then return end

            -- resultの型チェック
            if type(result) ~= "table" then
              vim.notify("Unexpected result type: " .. type(result), vim.log.levels.DEBUG)
              return
            end

            -- コードアクションを実行
            for _, res in pairs(result) do
              -- res.result がある場合とない場合に対応
              local actions = res.result or res

              -- actionsの型チェック
              if type(actions) == "table" then
                for _, action in pairs(actions) do
                  -- actionの型チェック（ここが重要！）
                  if type(action) == "table" then
                    if action.edit then
                      -- ワークスペースエディットを適用
                      vim.lsp.util.apply_workspace_edit(action.edit, "utf-8")
                    elseif action.command then
                      -- 新しいAPI でコマンド実行
                      vim.lsp.buf_request(bufnr, 'workspace/executeCommand', action.command, function(cmd_err)
                        if cmd_err then
                          vim.notify("Command execution failed: " .. cmd_err.message, vim.log.levels.WARN)
                        end
                      end)
                    end
                  end
                end
              end
            end
          end)
        end,
        desc = "Organize Imports on Save (Biome)",
      })
    end,
  }


  -- denols
  lspconfig.denols.setup {
    capabilities = capabilities,
    on_attach = function(client, bufnr)
      base_on_attach(client, bufnr) -- 共通処理を呼び出し
      -- denols 固有処理: Deno プロジェクトでなければ停止
      if not lu.is_find_nearest_file(vim.api.nvim_buf_get_name(bufnr), { "deno.json", "deno.jsonc" }) then
        pcall(client.stop) -- 安全のため pcall
      end
    end,
    filetypes = { "typescript", "javascript" },
    root_dir = function(fname) return lu.find_nearest_file(fname, { "deno.json", "deno.jsonc" }) end,
  }

  -- gopls
  lspconfig.gopls.setup {
    capabilities = capabilities,
    on_attach = function(client, bufnr)
      base_on_attach(client, bufnr) -- 共通処理を呼び出し

      -- gopls 固有処理: organizeImports の Autocmd (バッファローカルで定義)
      local gopls_augroup = vim.api.nvim_create_augroup("GoOrganizeImports_" .. bufnr, { clear = true })
      vim.api.nvim_create_autocmd("BufWritePre", {
        buffer = bufnr, -- バッファローカル！
        group = gopls_augroup,
        callback = function()
          local range_params = vim.lsp.util.make_range_params(0, "utf-8")
          local params = {
            textDocument = range_params.textDocument,
            range = range_params.range,
            context = { only = { "source.organizeImports" } }
          }

          -- 非同期版に変更（UIブロックを回避）
          vim.lsp.buf_request(bufnr, "textDocument/codeAction", params, function(err, result)
            if err then
              vim.notify("Go organize imports failed: " .. err.message, vim.log.levels.WARN)
              return
            end

            if not result then return end

            -- resultの型チェック
            if type(result) ~= "table" then
              vim.notify("Unexpected result type: " .. type(result), vim.log.levels.DEBUG)
              return
            end

            -- コードアクションを実行
            for _, res in pairs(result) do
              -- res.result がある場合とない場合に対応
              local actions = res.result or res

              -- actionsの型チェック
              if type(actions) == "table" then
                for _, action in pairs(actions) do
                  -- actionの型チェック（ここが重要！）
                  if type(action) == "table" then
                    if action.edit then
                      -- ワークスペースエディットを適用
                      vim.lsp.util.apply_workspace_edit(action.edit, "utf-8")
                    elseif action.command then
                      -- 新しいAPI でコマンド実行
                      vim.lsp.buf_request(bufnr, 'workspace/executeCommand', action.command, function(cmd_err)
                        if cmd_err then
                          vim.notify("Go command execution failed: " .. cmd_err.message, vim.log.levels.WARN)
                        end
                      end)
                    end
                  end
                end
              end
            end
          end)
        end,
        desc = "Organize Imports on Save (Go)",
      })
    end,
    settings = {
      gopls = {
        analyses = { unusedparams = true },
        staticcheck = true,
        gofumpt = true
      }
    },
  }

  -- tailwindcss
  lspconfig.tailwindcss.setup {
    capabilities = capabilities,
    on_attach = function(client, bufnr)
      -- Tailwind では補完を無効化（必要に応じて）
      client.server_capabilities.completionProvider = false
      base_on_attach(client, bufnr) -- 共通処理を呼び出し
    end,
    filetypes = { "javascriptreact", "typescriptreact", "vue" },
  }

  ----------------------------------------------------------------------
  -- TailwindCSS トグル機能 (元のままでOKそう)
  ----------------------------------------------------------------------
  _G.toggle_tailwind = function(state)
    local clients = vim.lsp.get_clients({ name = "tailwindcss" }) -- name でフィルタリング推奨
    for _, client in ipairs(clients) do
      -- 元のロジックで ON/OFF 切り替え
      if state == false or (state == nil and client.server_capabilities.completionProvider) then
        client.server_capabilities.completionProvider = nil
        vim.notify("TailwindCSS補完: OFF") -- OFF 時も通知すると分かりやすいかも
      else
        client.server_capabilities.completionProvider = {
          triggerCharacters = { '"', "'", "`", " ", ".", "[", "!", "-" },
        }
        vim.notify("TailwindCSS補完: ON")
      end
    end
  end

  vim.api.nvim_set_keymap('i', '<C-t>', '<Cmd>lua _G.toggle_tailwind(true)<CR>',
    { noremap = true, desc = "Toggle TailwindCSS completion" })

  -- InsertLeave の Autocmd もグループ化
  local tailwind_toggle_augroup = vim.api.nvim_create_augroup("TailwindToggleOff", { clear = true })
  vim.api.nvim_create_autocmd("InsertLeave", {
    group = tailwind_toggle_augroup,
    callback = function()
      _G.toggle_tailwind(false)
    end,
  })
end -- M.setup の終わり

return M
