local M = {}

M.setup = function()
  vim.api.nvim_set_keymap('n', '[GIT]', '<Nop>', { noremap = true })
  vim.api.nvim_set_keymap('n', '<Leader>g', '[GIT]', {})
  vim.api.nvim_set_keymap('n', '[GIT]s', ':Git<CR><C-w>T', { noremap = true })
  vim.api.nvim_set_keymap('n', '[GIT]a', ':Gwrite<CR>', { noremap = true })
  vim.api.nvim_set_keymap('n', '[GIT]c', ':Git commit -v<CR>', { noremap = true })
  vim.api.nvim_set_keymap('n', '[GIT]b', ':Git blame<CR>', { noremap = true })
  vim.api.nvim_set_keymap('n', '[GIT]d', ':Git difftool<CR>', { noremap = true })
  vim.api.nvim_set_keymap('n', '[GIT]m', ':Gmerge<CR>', { noremap = true })
  vim.api.nvim_set_keymap('n', '[GIT]l', ':Gllog<CR>', { noremap = true })
  vim.api.nvim_set_keymap('n', '[GIT]p', ':Git push<CR>', { noremap = true })
end

return M
