-- lsp.lua (ファイル名を仮定)
local M = {}

M.setup = function()
  -- 基本設定
  vim.keymap.set('n', '[LSP]', '<Nop>', { noremap = true })
  vim.keymap.set('n', 'l', '[LSP]', { remap = true, desc = 'LSP' })

  -- 必要なモジュールをロード
  local lu = require('lsp-utils') -- lsp-utils が必要ならそのまま
  local navic = require('nvim-navic')
  local navic_buffers = {}
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
    if client.server_capabilities.documentSymbolProvider and not navic_buffers[bufnr] then
      navic.attach(client, bufnr)
      navic_buffers[bufnr] = true
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

  local function adapt_root_dir(fn)
    return function(arg, on_dir)
      local fname = arg
      if type(arg) == 'number' then
        fname = vim.api.nvim_buf_get_name(arg)
      end
      if not fname or fname == '' then
        if on_dir then
          on_dir(nil)
        end
        return
      end
      local dir = fn(fname)
      if on_dir then
        on_dir(dir)
        return
      end
      return dir
    end
  end

  local function configure(server, extra)
    local overrides = extra or {}
    if overrides.root_dir then
      overrides = vim.tbl_deep_extend('force', {}, overrides)
      overrides.root_dir = adapt_root_dir(overrides.root_dir)
    end

    local opts = vim.tbl_deep_extend('force', {
      capabilities = capabilities,
      on_attach = base_on_attach,
    }, overrides)

    vim.lsp.config(server, opts)
    vim.lsp.enable(server)
  end

  -- 共通設定を使うサーバーリスト
  local common_servers = {
    "cssls",
    "stylelint_lsp",
    "rust_analyzer",
    "lua_ls",
    "pyright",
    "graphql",
    "rubocop",
    "ruby_lsp",
    "yamlls",
    "vimls",
    "protols",
    "sqls",
  }

  for _, server_name in ipairs(common_servers) do
    local extra
    if server_name == "yamlls" then
      extra = {
        settings = {
          yaml = { schemas = { ["https://json.schemastore.org/github-workflow.json"] = "/.github/workflows/*" } },
        },
      }
    elseif server_name == "graphql" then
      extra = {
        root_dir = function(fname)
          return lu.find_nearest_file(fname,
            { '.graphqlrc*', '.graphql.config.*', 'graphql.config.*' })
        end,
      }
    elseif server_name == "sqls" then
      extra = {
        cmd = { "sqls", "-config", "~/.config/sqls/config.yml" },
      }
    end
    configure(server_name, extra)
  end

  -- 個別の設定が必要なサーバー

  -- tsgoコマンドの存在チェック関数
  local function is_tsgo_available()
    local has_npx = vim.fn.executable('npx') == 1
    local tsgo_version = vim.fn.system('npx tsgo --version 2>&1')
    -- バージョン文字列をチェック（"Version"を含むかどうか）
    local has_tsgo = tsgo_version:match('Version') ~= nil or tsgo_version:match('tsgo') ~= nil
    return has_npx and has_tsgo
  end

  -- TypeScript/JavaScript用のLSP設定
  if is_tsgo_available() then
    -- tsgoのカスタム設定を追加
    configure('tsgo', {
      on_attach = base_on_attach,
      root_dir = function(fname)
        if lu.is_find_nearest_file(fname, { 'deno.json', 'deno.jsonc' }) then
          return nil
        end
        return lu.find_nearest_file(fname, { 'tsconfig.json', 'jsconfig.json', 'package.json' })
      end,
      filetypes = { "typescript", "javascript", "typescriptreact", "javascriptreact" },
      cmd = { "npx", "tsgo", "--lsp", "--stdio" },
      workspace_required = true,

      -- tsgoの設定
      settings = {
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
    })
  else
    -- tsgoが使えない場合はvtslsを使用
    configure('vtsls', {
      on_attach = base_on_attach,
      root_dir = function(fname)
        if lu.is_find_nearest_file(fname, { 'deno.json', 'deno.jsonc' }) then
          return nil
        end
        return lu.find_nearest_file(fname, { 'tsconfig.json', 'jsconfig.json', 'package.json' })
      end,
      filetypes = { "typescript", "javascript", "typescriptreact", "javascriptreact" },
      workspace_required = true,
      settings = {
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
    })
  end

  configure('astro', {
    cmd = { 'astro-ls', '--stdio' },
    filetypes = { 'astro' },
    init_options = {
      typescript = {},
    },
    root_dir = function(fname)
      return lu.find_nearest_file(fname, { 'package.json', 'tsconfig.json', 'jsconfig.json', '.git' })
    end,
    before_init = function(params, config)
      config.init_options = config.init_options or {}
      config.init_options.typescript = config.init_options.typescript or {}
      local typescript = config.init_options.typescript

      if typescript.tsdk and typescript.tsdk ~= '' then
        return
      end

      local search_targets = { 'tsserverlibrary.js', 'typescript.js' }

      local function validate_tsdk(path)
        if not path or path == '' then
          return nil
        end

        local real = vim.uv.fs_realpath(path) or path
        local stat = vim.uv.fs_stat(real)
        if not stat then
          return nil
        end

        local dir = real
        if stat.type == 'file' then
          dir = vim.fs.dirname(real)
        elseif stat.type ~= 'directory' then
          return nil
        end

        local ok = false
        for _, target in ipairs(search_targets) do
          if vim.fn.filereadable(vim.fs.joinpath(dir, target)) == 1 then
            ok = true
            break
          end
        end

        if ok then
          return dir
        end

        return nil
      end

      local function set_tsdk(path)
        local dir = validate_tsdk(path)
        if not dir then
          return false
        end
        typescript.tsdk = dir
        return true
      end

      local function find_tsdk(start)
        if not start or start == '' then
          return false
        end
        local found = vim.fs.find(search_targets, {
          path = start,
          type = 'file',
          limit = 1,
        })
        if not found or not found[1] then
          return false
        end
        return set_tsdk(found[1])
      end

      local exe = vim.fn.exepath('astro-ls')
      if exe ~= '' then
        exe = vim.uv.fs_realpath(exe) or exe
        local bin_dir = vim.fs.dirname(exe)
        local ls_root = bin_dir and vim.fs.dirname(bin_dir)
        if ls_root and ls_root ~= '' then
          if set_tsdk(vim.fs.joinpath(ls_root, 'node_modules', 'typescript', 'lib')) or find_tsdk(ls_root) then
            return
          end
        end
      end

      local get_ts_path = vim.lsp and vim.lsp.get_typescript_server_path
      if type(get_ts_path) == 'function' then
        local ok, path = pcall(get_ts_path)
        if ok and set_tsdk(path) then
          return
        end
      end

      local root = params.rootUri and vim.uri_to_fname(params.rootUri) or params.rootPath
      if not root or root == '' then
        root = nil
      end

      if root and (set_tsdk(vim.fs.joinpath(root, 'node_modules', 'typescript', 'lib')) or find_tsdk(root)) then
        return
      end
    end,
  })

  -- biome
  configure('biome', {
    cmd = { "npx", "@biomejs/biome", "lsp-proxy" },
    root_dir = function(fname)
      local git_root = lu.util.find_git_ancestor(fname)
      if git_root and vim.fn.filereadable(git_root .. '/biome.json') == 1 then
        return git_root
      end
      return lu.find_nearest_file(fname, 'biome.json')
    end,
    on_attach = function(client, bufnr)
      -- Biome ではフォーマットを優先し、補完を無効化
      client.server_capabilities.documentFormattingProvider = true
      client.server_capabilities.completionProvider = false
      base_on_attach(client, bufnr) -- 共通処理を呼び出し

      -- biome 固有処理: organizeImports の Autocmd (バッファローカルで定義)
      local biome_augroup = vim.api.nvim_create_augroup("BiomeOrganizeImports_" .. bufnr, { clear = true })

      vim.api.nvim_create_autocmd("BufWritePre", {
        buffer = bufnr,
        group = biome_augroup,
        callback = function()
          -- 同期的に実行するためのフラグ
          local timeout = 1000 -- 1秒のタイムアウト

          -- コードアクションのパラメータを作成
          local params = {
            textDocument = vim.lsp.util.make_text_document_params(bufnr),
            range = {
              start = { line = 0, character = 0 },
              ["end"] = { line = vim.api.nvim_buf_line_count(bufnr), character = 0 }
            },
            context = {
              only = { "source.organizeImports.biome" },
              diagnostics = {}
            }
          }

          -- 同期的にコードアクションを取得
          local result = vim.lsp.buf_request_sync(bufnr, "textDocument/codeAction", params, timeout)

          if not result then
            return
          end

          -- 結果を処理
          for _, res in pairs(result) do
            if res.result then
              for _, action in ipairs(res.result) do
                if action.edit then
                  -- ワークスペースエディットを適用
                  vim.lsp.util.apply_workspace_edit(action.edit, "utf-8")
                elseif action.command then
                  -- コマンドを同期的に実行
                  local cmd_result = vim.lsp.buf_request_sync(
                    bufnr,
                    "workspace/executeCommand",
                    action.command,
                    timeout
                  )
                  -- エラーチェック（必要に応じて）
                  if not cmd_result then
                    vim.notify("Biome: Command execution failed", vim.log.levels.WARN)
                  end
                end
              end
            end
          end
        end,
        desc = "Organize Imports on Save (Biome)",
      })
    end,
  })


  -- denols
  configure('denols', {
    on_attach = function(client, bufnr)
      base_on_attach(client, bufnr) -- 共通処理を呼び出し
      -- denols 固有処理: Deno プロジェクトでなければ停止
      if not lu.is_find_nearest_file(vim.api.nvim_buf_get_name(bufnr), { "deno.json", "deno.jsonc" }) then
        pcall(client.stop) -- 安全のため pcall
      end
    end,
    filetypes = { "typescript", "javascript" },
    single_file_support = false,
    workspace_required = true,
    root_markers = { 'deno.json', 'deno.jsonc' },
  })

  -- gopls
  configure('gopls', {
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
  })

  -- tailwindcss
  configure('tailwindcss', {
    on_attach = function(client, bufnr)
      -- Tailwind では補完を無効化（必要に応じて）
      client.server_capabilities.completionProvider = false
      base_on_attach(client, bufnr) -- 共通処理を呼び出し
    end,
    filetypes = { "javascriptreact", "typescriptreact", "vue" },
  })

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
