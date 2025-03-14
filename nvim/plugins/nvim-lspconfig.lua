vim.api.nvim_set_keymap('n', '[LSP]', '<Nop>', { noremap = true })
vim.api.nvim_set_keymap('n', 'l', '[LSP]', {})

local on_attach = function(client, bufnr)
  -- バッファローカルキーマッピングを設定
  local function buf_set_keymap(...) vim.api.nvim_buf_set_keymap(bufnr, ...) end
  local opts = { noremap = true }

  -- LSP関連のキーマッピング
  buf_set_keymap('n', '[LSP]a', '<Cmd>lua vim.lsp.buf.code_action()<CR>', opts)
  buf_set_keymap('n', '[LSP]D', '<Cmd>lua vim.lsp.buf.definition()<CR>', opts)
  buf_set_keymap('n', '[LSP]T', '<Cmd>lua vim.lsp.buf.type_definition()<CR>', opts)
  buf_set_keymap('n', '[LSP]r', '<Cmd>lua vim.lsp.buf.references()<CR>', opts)
  buf_set_keymap('n', '[LSP]R', '<Cmd>lua vim.lsp.buf.rename()<CR>', opts)
  buf_set_keymap('n', '[LSP]w', '<Cmd>lua vim.lsp.buf.workspace_symbol()<CR>', opts)
  buf_set_keymap('n', '[LSP]I', '<Cmd>lua vim.lsp.buf.implementation()<CR>', opts)
  buf_set_keymap('n', '[LSP]d', '<Cmd>lua vim.lsp.buf.document_symbol()<CR>', opts)
  buf_set_keymap('n', '[LSP]k', '<Cmd>lua vim.diagnostic.goto_prev()<CR>', opts)
  buf_set_keymap('n', '[LSP]s', '<Cmd>lua vim.diagnostic.goto_next()<CR>', opts)
  buf_set_keymap('n', '[LSP]l', '<Cmd>lua vim.diagnostic.setloclist()<CR>', opts)
  buf_set_keymap('n', 'H', '<Cmd>lua vim.lsp.buf.hover()<CR>', opts)
  -- ファイル保存時にフォーマット
  local function format_on_save()
    local filename = vim.fn.expand('%:t')
    if not string.find(filename, 'no_fmt') then
      vim.lsp.buf.format()
    end
  end

  --  -- ファイル保存時にPrettierを実行
  --  local function run_prettier()
  --    local filename = vim.fn.expand('%:t')
  --    if not string.find(filename, 'no_fmt') then
  --      vim.cmd("silent! Prettier")
  --    end
  --  end

  -- オートコマンドグループを作成
  local augroup = vim.api.nvim_create_augroup("FormatOnSave", { clear = true })

  -- BufWritePre イベントでフォーマットを実行
  vim.api.nvim_create_autocmd("BufWritePre", {
    buffer = 0,
    group = augroup,
    callback = format_on_save,
  })

  --  -- BufWritePost イベントでPrettierを実行
  --  vim.api.nvim_create_autocmd("BufWritePost", {
  --    pattern = { "*.js", "*.ts", "*.jsx", "*.tsx" },
  --    group = augroup,
  --    callback = run_prettier,
  --  })

  -- tsserverとdenolsの判定
  local lspconfig = require 'lspconfig'

  local function is_deno_project(fname)
    return lspconfig.util.root_pattern("deno.json", "deno.jsonc")(fname) ~= nil
  end

  -- Client.nameの判定
  if client.name == "ts_ls" and is_deno_project(vim.api.nvim_buf_get_name(bufnr)) then
    client.stop() -- Denoプロジェクトの場合はtsserverを停止
  elseif client.name == "denols" and not is_deno_project(vim.api.nvim_buf_get_name(bufnr)) then
    client.stop() -- Denoプロジェクトでない場合はdenolsを停止
  end
end

-- LSPサーバーの設定
-- LSPのcapabilitiesを適切に設定
local capabilities = require("ddc_source_lsp").make_client_capabilities()

local lspconfig = require 'lspconfig'

lspconfig.ts_ls.setup {
  capabilities = capabilities,
  on_attach,
  root_dir = lspconfig.util.root_pattern("package.json"),
  filetypes = { "typescript", "javascript", "typescriptreact", "javascriptreact" },
}

lspconfig.biome.setup {
  capabilities = capabilities,
  on_attach = function(client, bufnr)
    on_attach(client, bufnr)
    client.server_capabilities.documentFormattingProvider = true -- フォーマッティングはbiomeに任せて、補完などはts_lsに任せる
    client.server_capabilities.completionProvider = false        -- 補完はts_lsに任せる
    -- ファイル保存時にorganizeImportsを実行
    vim.api.nvim_create_autocmd("BufWritePre", {
      buffer = bufnr,
      callback = function()
        local params = vim.lsp.util.make_range_params()
        params.context = { only = { "source.organizeImports.biome" }, diagnostics = {} }
        local result = vim.lsp.buf_request_sync(bufnr, "textDocument/codeAction", params, 3000)
        for _, res in pairs(result or {}) do
          for _, r in pairs(res.result or {}) do
            if r.edit then
              vim.lsp.util.apply_workspace_edit(r.edit, "utf-8")
            else
              vim.lsp.buf.execute_command(r.command)
            end
          end
        end
      end,
    })
  end,
}

-- local eslint = {
--   lintCommand = 'eslint -f visualstudio --stdin --stdin-filename ${INPUT}',
--   lintStdin = true,
--   lintFormats = { '%f(%l,%c): %tarning %m', '%f(%l,%c): %rror %m' },
--   formatCommand = 'eslint --fix-to-stdout --stdin --stdin-filename=${INPUT}',
--   formatStdin = true
-- }
--
-- lspconfig.efm.setup {
--   init_options = {
--     documentFormatting = true,
--     rangeFormatting = true,
--     hover = true,
--     documentSymbol = true,
--     codeAction = true,
--     completion = true,
--   },
--   settings = {
--     rootMarkers = { ".git/" },
--     languages = {
--       javascript = { eslint },
--       javascriptreact = { eslint },
--       ['javascript.jsx'] = { eslint },
--       typescript = { eslint },
--       typescriptreact = { eslint },
--       ['typescript.tsx'] = { eslint },
--     }
--   },
--   filetypes = { "javascript", "typescript", "javascriptreact", "javascript.jsx", "typescriptreact", "typescript.tsx" },
--   root_dir = lspconfig.util.root_pattern("package.json"),
--   on_attach = on_attach,
-- }

lspconfig.denols.setup {
  capabilities = capabilities,
  on_attach = on_attach,
  filetypes = { "typescript", "javascript" },
  root_dir = lspconfig.util.root_pattern("deno.json", "deno.jsonc"),
}

-- bun i --global vscode-langservers-extracted
lspconfig.cssls.setup {
  capabilities = capabilities,
  on_attach = on_attach,
}

lspconfig.stylelint_lsp.setup {
  capabilities = capabilities,
  on_attach = on_attach,
  filetypes = { "css", "scss", "less", "vue" },
}

lspconfig.rust_analyzer.setup {
  capabilities = capabilities,
  on_attach = on_attach,
}

lspconfig.gopls.setup {
  capabilities = capabilities,
  on_attach = function(client, bufnr)
    on_attach(client, bufnr)
    -- ファイル保存時にorganizeImportsを実行
    vim.api.nvim_create_autocmd("BufWritePre", {
      pattern = "*.go",
      callback = function()
        local params = vim.lsp.util.make_range_params()
        params.context = { only = { "source.organizeImports" } }
        local result = vim.lsp.buf_request_sync(0, "textDocument/codeAction", params, 3000)
        for _, res in pairs(result or {}) do
          for _, r in pairs(res.result or {}) do
            if r.edit then
              vim.lsp.util.apply_workspace_edit(r.edit, "utf-8")
            else
              vim.lsp.buf.execute_command(r.command)
            end
          end
        end
      end,
    })
  end,
  settings = {
    gopls = {
      analyses = {
        unusedparams = true,
      },
      staticcheck = true,
      gofumpt = true,
    },
  }
}

lspconfig.lua_ls.setup {
  capabilities = capabilities,
  on_attach = on_attach,
  on_init = function(client)
    local path = client.workspace_folders[1].name
    if vim.fs.stat(path .. '/.luarc.json') or vim.fs.stat(path .. '/.luarc.jsonc') then
      return
    end
    client.config.settings.Lua = client.config.settings.Lua or {}
    client.config.settings.Lua = vim.tbl_deep_extend('force', client.config.settings.Lua, {
      runtime = {
        version = 'LuaJIT'
      },
      workspace = {
        checkThirdParty = false,
        library = {
          vim.env.VIMRUNTIME
        }
      }
    })
  end,
}

lspconfig.pyright.setup {
  capabilities = capabilities,
  on_attach = on_attach,
}

lspconfig.graphql.setup {
  capabilities = capabilities,
  on_attach = on_attach,
  root_dir = lspconfig.util.root_pattern('.graphqlrc*', '.graphql.config.*', 'graphql.config.*'),
}

lspconfig.rubocop.setup {
  capabilities = capabilities,
  on_attach = on_attach,
}

lspconfig.ruby_lsp.setup {
  capabilities = capabilities,
  on_attach = on_attach,
}

lspconfig.yamlls.setup {
  capabilities = capabilities,
  on_attach = on_attach,
  settings = {
    yaml = {
      schemas = {
        ["https://json.schemastore.org/github-workflow.json"] = "/.github/workflows/*",
      }
    }
  },
}

lspconfig.vimls.setup {
  capabilities = capabilities,
  on_attach = on_attach,
}

lspconfig.tailwindcss.setup {
  capabilities = capabilities,
  on_attach = function(client, bufnr)
    -- TailwindCSSの補完機能を制限
    client.server_capabilities.completionProvider = false
    on_attach(client, bufnr)
  end,
  filetypes = { "javascriptreact", "typescriptreact", "vue" },
}

-- TailwindCSS LSPのトグル機能
_G.toggle_tailwind = function(state)
  local clients = vim.lsp.get_clients()
  for _, client in ipairs(clients) do
    if client.name == "tailwindcss" then
      if state == false or (state == nil and client.server_capabilities.completionProvider) then
        -- 補完機能を無効化
        client.server_capabilities.completionProvider = nil
      else
        -- 補完機能を有効化
        client.server_capabilities.completionProvider = {
          triggerCharacters = { '"', "'", "`", " ", ".", "[", "!", "-" }
        }
        vim.notify("TailwindCSS補完: ON")
      end
    end
  end
end

vim.api.nvim_set_keymap('i', '<C-t>', '<C-o>:lua _G.toggle_tailwind(true)<CR>', { noremap = true })

-- インサートモードを抜けたらOFFに戻す
vim.api.nvim_create_autocmd("InsertLeave", {
  callback = function()
    _G.toggle_tailwind(false)
  end,
})


-- Protobuf
lspconfig.protols.setup {
  capabilities = capabilities,
  on_attach = on_attach,
}
