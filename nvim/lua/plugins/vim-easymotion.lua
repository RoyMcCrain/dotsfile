local M = {}

M.setup = function()
  -- Disable default mappings
  vim.g.EasyMotion_do_mapping = 0
  vim.api.nvim_set_keymap('n', '[EasyM]', '<Nop>', {})
  vim.api.nvim_set_keymap('n', '<Leader><Space>', '[EasyM]', {})
  -- Gif config
  vim.api.nvim_set_keymap('n', '[EasyM]a', '<Plug>(easymotion-overwin-f2)', { noremap = true })
  vim.api.nvim_set_keymap('n', '[EasyM]s', '<Plug>(easymotion-lineforward)', { noremap = true })
  vim.api.nvim_set_keymap('n', '[EasyM]t', '<Plug>(easymotion-j)', { noremap = true })
  vim.api.nvim_set_keymap('n', '[EasyM]n', '<Plug>(easymotion-k)', { noremap = true })
  vim.api.nvim_set_keymap('n', '[EasyM]k', '<Plug>(easymotion-linebackward)', { noremap = true })
  -- keep cursor column when JK motion
  vim.g.EasyMotion_startofline = 0
  vim.g.EasyMotion_smartcase = 1
end

return M
