vim.api.nvim_set_keymap('n', '<Leader>l', '<Cmd>Fern . -reveal=%<CR>', {noremap = true, silent = true})

local function init_fern()
  vim.api.nvim_buf_set_keymap(0, 'n', 'V', '<Plug>(fern-action-open:vsplit)', {})
  vim.api.nvim_buf_set_keymap(0, 'n', 'S', '<Plug>(fern-action-open:split)', {})
end

_G.init_fern = init_fern

vim.api.nvim_exec([[
  augroup fern_custom
  autocmd!
  autocmd FileType fern lua _G.init_fern()
  augroup END
]], false)
