local on_attach = function(client, bufnr)
	-- バッファローカルキーマッピングを設定
	local function buf_set_keymap(...) vim.api.nvim_buf_set_keymap(bufnr, ...) end
	local opts = { noremap=true, silent=true }

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

	-- その他のキーマッピング
	-- 例: buf_set_keymap('n', 'キー', 'コマンド', opts)

	-- ファイル保存時にフォーマット
	if client.server_capabilities.document_formatting then
		vim.cmd("autocmd BufWritePre <buffer> lua vim.lsp.buf.formatting_sync()")
	end
end

-- LSPサーバーの設定
local lspconfig = require'lspconfig'
lspconfig.tsserver.setup {
	on_attach = on_attach,
	cmd = {"bunx", "typescript-language-server", "--stdio"},
  root_dir = lspconfig.util.root_pattern("package.json"),
}

lspconfig.biome.setup {
	on_attach = on_attach,
	cmd = {"bunx", "biome", "lsp-proxy"},
}

lspconfig.denols.setup{
	on_attach = on_attach,
	filetypes = { "typescript", "javascript" },
  root_dir = lspconfig.util.root_pattern("deno.json", "deno.jsonc"),
}
