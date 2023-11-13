vim.api.nvim_set_keymap('n', '<Leader>l', '<Cmd>Fern . -reveal=%<CR>', {noremap = true, silent = true})
vim.g.fern_disable_default_mappings = 1

_G.init_fern = function()
  vim.api.nvim_buf_set_keymap(0, 'n', '<CR>','<Plug>(fern-action-open-or-expand)', {})
  vim.api.nvim_buf_set_keymap(0, 'n', '<BS>', '<Plug>(fern-action-collapse)', {})
  vim.api.nvim_buf_set_keymap(0, 'n', '<Left>', '<Plug>(fern-action-collapse)', {})
  vim.api.nvim_buf_set_keymap(0, 'n', '<Right>', '<Plug>(fern-action-expand)', {})
  vim.api.nvim_buf_set_keymap(0, 'n', 'V', '<Plug>(fern-action-open:vsplit)', {})
  vim.api.nvim_buf_set_keymap(0, 'n', 'S', '<Plug>(fern-action-open:split)', {})
  vim.api.nvim_buf_set_keymap(0, 'n', 'D', '<Plug>(fern-action-remove)', {})
end

vim.api.nvim_exec([[
  augroup fern_custom
  autocmd!
  autocmd FileType fern lua _G.init_fern()
  augroup END
]], false)
