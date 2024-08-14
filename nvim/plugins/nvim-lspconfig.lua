vim.api.nvim_set_keymap('n', '[LSP]', '<Nop>', { noremap = true })
vim.api.nvim_set_keymap('n', 'l', '[LSP]', {})

local on_attach = function(_client, bufnr)
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

  -- ファイル保存時にPrettierを実行
  local function run_prettier()
    local filename = vim.fn.expand('%:t')
    if not string.find(filename, 'no_fmt') then
      vim.cmd("silent! Prettier")
    end
  end

  -- オートコマンドグループを作成
  local augroup = vim.api.nvim_create_augroup("FormatOnSave", { clear = true })

  -- BufWritePre イベントでフォーマットを実行
  vim.api.nvim_create_autocmd("BufWritePre", {
    buffer = 0,
    group = augroup,
    callback = format_on_save,
  })

  -- BufWritePost イベントでPrettierを実行
  vim.api.nvim_create_autocmd("BufWritePost", {
    pattern = { "*.js", "*.ts", "*.jsx", "*.tsx", "*.php" },
    group = augroup,
    callback = run_prettier,
  })
end

local capabilities = require("ddc_source_lsp").make_client_capabilities()

-- LSPサーバーの設定
local lspconfig = require 'lspconfig'
lspconfig.tsserver.setup {
  on_attach = on_attach,
  root_dir = lspconfig.util.root_pattern("package.json"),
  capabilities = capabilities,
}

-- lspconfig.biome.setup {
--  on_attach = on_attach,
--  cmd = { "bunx", "biome", "lsp-proxy" },
--  capabilities = capabilities,
-- }

lspconfig.denols.setup {
  on_attach = on_attach,
  filetypes = { "typescript", "javascript" },
  root_dir = lspconfig.util.root_pattern("deno.json", "deno.jsonc"),
  capabilities = capabilities,
}

-- bun i --global vscode-langservers-extracted
lspconfig.cssls.setup {
  on_attach = on_attach,
  capabilities = capabilities,
}

lspconfig.stylelint_lsp.setup {
  on_attach = on_attach,
  filetypes = { "css", "scss", "less", "vue" },
  capabilities = capabilities,
}

lspconfig.rust_analyzer.setup {
  on_attach = on_attach,
  capabilities = capabilities,
}

lspconfig.gopls.setup {
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
              vim.lsp.util.apply_workspace_edit(r.edit, "UTF-8")
            else
              vim.lsp.buf.execute_command(r.command)
            end
          end
        end
      end,
    })
  end,
  capabilities = capabilities,
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
  on_attach = on_attach,
  on_init = function(client)
    local path = client.workspace_folders[1].name
    -- vim.loopはv1で削除予定らしい
    if vim.loop.fs_stat(path .. '/.luarc.json') or vim.loop.fs_stat(path .. '/.luarc.jsonc') then
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
  capabilities = capabilities,
}

lspconfig.pyright.setup {
  on_attach = on_attach,
  capabilities = capabilities,
}

lspconfig.graphql.setup {
  on_attach = on_attach,
  root_dir = lspconfig.util.root_pattern('.graphqlrc*', '.graphql.config.*', 'graphql.config.*'),
  capabilities = capabilities,
}

lspconfig.rubocop.setup {
  on_attach = on_attach,
  capabilities = capabilities,
}

lspconfig.ruby_lsp.setup {
  on_attach = on_attach,
  capabilities = capabilities,
}

lspconfig.yamlls.setup {
  on_attach = on_attach,
  settings = {
    yaml = {
      schemas = {
        ["https://json.schemastore.org/github-workflow.json"] = "/.github/workflows/*",
      }
    }
  },
  capabilities = capabilities,
}

lspconfig.vimls.setup {
  on_attach = on_attach,
  capabilities = capabilities,
}

lspconfig.tailwindcss.setup {
  on_attach = on_attach,
  capabilities = capabilities,
}

-- bun i --global intelephense
lspconfig.intelephense.setup {
  on_attach = on_attach,
  capabilities = capabilities,
}
