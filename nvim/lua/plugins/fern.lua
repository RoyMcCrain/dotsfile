local M = {}

M.setup = function()
  vim.keymap.set('n', '<Leader>l', '<Cmd>Fern . -reveal=%<CR>', { noremap = true })
  vim.keymap.set('n', '<Leader>m', '<Cmd>Fern . -drawer -reveal=% -width=50 -toggle <CR>', { noremap = true })
  vim.g['fern#disable_default_mappings'] = 1
  vim.g['fern#default_hidden'] = 1

  _G.init_fern = function()
    vim.keymap.set('n', '<CR>', '<Plug>(fern-action-open-or-expand)', { buffer = 0 })
    vim.keymap.set('n', '<BS>', '<Plug>(fern-action-collapse)', { buffer = 0 })
    vim.keymap.set('n', '<Left>', '<Plug>(fern-action-collapse)', { buffer = 0 })
    vim.keymap.set('n', '<Right>', '<Plug>(fern-action-expand)', { buffer = 0 })
    vim.keymap.set('n', 'V', '<Plug>(fern-action-open:vsplit)', { buffer = 0 })
    vim.keymap.set('n', 'S', '<Plug>(fern-action-open:split)', { buffer = 0 })
    vim.keymap.set('n', 'D', '<Plug>(fern-action-remove)', { buffer = 0 })
    vim.keymap.set('n', 'l', '<Plug>(fern-action-reload)', { buffer = 0 })
    vim.keymap.set('n', 'N', '<Plug>(fern-action-new-file)', { buffer = 0 })
    vim.keymap.set('n', 'K', '<Plug>(fern-action-new-dir)', { buffer = 0 })
    vim.keymap.set('n', 'c', '<Plug>(fern-action-copy)', { buffer = 0 })
    vim.keymap.set('n', 'm', '<Plug>(fern-action-move)', { buffer = 0 })
    vim.keymap.set('n', 'R', '<Plug>(fern-action-rename)', { buffer = 0 })
  end

  vim.cmd([[
    augroup fern_custom
    autocmd!
    autocmd FileType fern lua _G.init_fern()
    augroup END
  ]])
end

return M
