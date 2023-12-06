vim.api.nvim_set_keymap('n', '[LSP]', '', { noremap = true })
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
	buf_set_keymap('n', '[LSP]s', '<Cmd>lua vim.lsp.buf.document_symbol()<CR>', opts)
	buf_set_keymap('n', '[LSP]e', '<Cmd>lua vim.lsp.diagnostic.show_line_diagnostics()<CR>', opts)
	buf_set_keymap('n', 'H', '<Cmd>lua vim.lsp.buf.hover()<CR>', opts)
	-- ファイル保存時にフォーマット
	vim.cmd("autocmd BufWritePre <buffer> lua vim.lsp.buf.format()")
end

-- LSPサーバーの設定
local lspconfig = require 'lspconfig'
lspconfig.tsserver.setup {
	on_attach = on_attach,
	cmd = { "bunx", "typescript-language-server", "--stdio" },
	root_dir = lspconfig.util.root_pattern("package.json"),
}

lspconfig.biome.setup {
	on_attach = on_attach,
	cmd = { "bunx", "biome", "lsp-proxy" },
}

lspconfig.denols.setup {
	on_attach = on_attach,
	filetypes = { "typescript", "javascript" },
	root_dir = lspconfig.util.root_pattern("deno.json", "deno.jsonc"),
}

-- bun i --global vscode-langservers-extracted
lspconfig.cssls.setup {
	on_attach = on_attach,
	cmd = { "bunx", "vscode-css-language-server", "--stdio" },
}

lspconfig.stylelint_lsp.setup {
	on_attach = on_attach,
	cmd = { "bunx", "stylelint-lsp", "--stdio" },
	filetypes = { "css", "scss", "less", "vue" },
}

lspconfig.rust_analyzer.setup {
	on_attach = on_attach,
}

lspconfig.gopls.setup {
	on_attach = on_attach,
}

lspconfig.lua_ls.setup {
	on_attach = on_attach,
	on_init = function(client)
		local path = client.workspace_folders[1].name
		local function file_exists(p)
			local f = io.open(p, "r")
			if f ~= nil then
				io.close(f)
				return true
			else
				return false
			end
		end
		if not file_exists(path .. '/.luarc.json') and not file_exists(path .. '/.luarc.jsonc') then
			client.config.settings = vim.tbl_deep_extend('force', client.config.settings, {
				Lua = {
					runtime = {
						version = 'LuaJIT'
					},
					workspace = {
						checkThirdParty = false,
						library = {
							vim.env.VIMRUNTIME
						}
					}
				}
			})
			client.notify("workspace/didChangeConfiguration", { settings = client.config.settings })
		end
		return true
	end
}

lspconfig.pyright.setup {
	on_attach = on_attach,
}

lspconfig.graphql.setup {
	on_attach = on_attach,
	cmd = { "bunx", "graphql-lsp", "server", "-m", "stream" },
	root_dir = lspconfig.util.root_pattern('.graphqlrc*', '.graphql.config.*', 'graphql.config.*')
}

lspconfig.rubocop.setup {
	on_attach = on_attach,
}

lspconfig.ruby_ls.setup {
	on_attach = on_attach,
}

lspconfig.taplo.setup {
	on_attach = on_attach,
}

lspconfig.yamlls.setup {
	on_attach = on_attach,
	cmd = { "bunx", "yaml-language-server", "--stdio" },
	settings = {
		yaml = {
			schemas = {
				["https://json.schemastore.org/github-workflow.json"] = "/.github/workflows/*",
			}
		}
	}
}

lspconfig.vimls.setup {
	on_attach = on_attach,
	cmd = { "bunx", "vim-language-server", "--stdio" }
}
