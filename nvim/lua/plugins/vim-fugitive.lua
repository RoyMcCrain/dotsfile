local M = {}

M.setup = function()
  vim.keymap.set('n', '[GIT]', '<Nop>', { noremap = true })
  vim.keymap.set('n', '<Leader>g', '[GIT]', { remap = true })
  vim.keymap.set('n', '[GIT]s', ':Git<CR><C-w>T', { noremap = true })
  vim.keymap.set('n', '[GIT]a', ':Gwrite<CR>', { noremap = true })
  vim.keymap.set('n', '[GIT]c', ':Git commit -v<CR>', { noremap = true })
  vim.keymap.set('n', '[GIT]b', ':Git blame<CR>', { noremap = true })
  vim.keymap.set('n', '[GIT]d', ':Git difftool<CR>', { noremap = true })
  vim.keymap.set('n', '[GIT]m', ':Gmerge<CR>', { noremap = true })
  vim.keymap.set('n', '[GIT]l', ':Gllog<CR>', { noremap = true })
  vim.keymap.set('n', '[GIT]p', ':Git push<CR>', { noremap = true })
end

return M
