vim.cmd('autocmd BufWritePre * LspDocumentFormatSync')

vim.api.nvim_set_keymap('n', '[LSP]', '', {noremap = true})
vim.api.nvim_set_keymap('n', 'h', '[LSP]', {silent = true})

vim.api.nvim_set_keymap('n', 'H', '<Cmd>LspHover<CR>', {silent = true, noremap = true})

vim.api.nvim_set_keymap('n', '[LSP]a', '<Cmd>LspCodeAction<CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[LSP]D', '<Cmd>LspDefinition<CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[LSP]d', '<Cmd>LspPeekDefinition<CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[LSP]T', '<Cmd>LspTypeDefinition<CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[LSP]t', '<Cmd>LspPeekTypeDefinition<CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[LSP]r', '<Cmd>LspReferences<CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[LSP]R', '<Cmd>LspRename<CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[LSP]w', '<Cmd>LspWorkspaceSymbol<CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[LSP]I', '<Cmd>LspImplementation<CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[LSP]i', '<Cmd>LspPeekImplementation<CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[LSP]s', '<Cmd>LspStatus<CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[LSP]e', '<Cmd>LspDocumentDiagnostics<CR>', {silent = true, noremap = true})
