vim.api.nvim_set_keymap('n', '<Leader>l', '<Cmd>Fern . -reveal=%<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<Leader>m', '<Cmd>Fern . -drawer -reveal=% -width=80 -toggle <CR>',
	{ noremap = true, silent = true })
vim.g['fern#disable_default_mappings'] = 1
vim.g['fern#default_hidden'] = 1

_G.init_fern = function()
	vim.api.nvim_buf_set_keymap(0, 'n', '<CR>', '<Plug>(fern-action-open-or-expand)', {})
	vim.api.nvim_buf_set_keymap(0, 'n', '<BS>', '<Plug>(fern-action-collapse)', {})
	vim.api.nvim_buf_set_keymap(0, 'n', '<Left>', '<Plug>(fern-action-collapse)', {})
	vim.api.nvim_buf_set_keymap(0, 'n', '<Right>', '<Plug>(fern-action-expand)', {})
	vim.api.nvim_buf_set_keymap(0, 'n', 'V', '<Plug>(fern-action-open:vsplit)', {})
	vim.api.nvim_buf_set_keymap(0, 'n', 'S', '<Plug>(fern-action-open:split)', {})
	vim.api.nvim_buf_set_keymap(0, 'n', 'D', '<Plug>(fern-action-remove)', {})
	vim.api.nvim_buf_set_keymap(0, 'n', 'l', '<Plug>(fern-action-reload)', {})
	vim.api.nvim_buf_set_keymap(0, 'n', 'N', '<Plug>(fern-action-new-file)', {})
	vim.api.nvim_buf_set_keymap(0, 'n', 'K', '<Plug>(fern-action-new-dir)', {})
	vim.api.nvim_buf_set_keymap(0, 'n', 'c', '<Plug>(fern-action-copy)', {})
	vim.api.nvim_buf_set_keymap(0, 'n', 'm', '<Plug>(fern-action-move)', {})
	vim.api.nvim_buf_set_keymap(0, 'n', 'R', '<Plug>(fern-action-rename)', {})
end

vim.api.nvim_exec2([[
  augroup fern_custom
  autocmd!
  autocmd FileType fern lua _G.init_fern()
  augroup END
]], {})
