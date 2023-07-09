vim.api.nvim_set_keymap('i', '<C-t><C-t>', 'copilot#Accept(\'<CR>\')', {expr = true, silent = true, noremap = true})
vim.api.nvim_set_keymap('i', '<C-t><C-n>', '<Plug>(copilot-next)', {silent = true, noremap = true})
vim.api.nvim_set_keymap('i', '<C-t><C-p>', '<Plug>(copilot-previous)', {silent = true, noremap = true})
vim.api.nvim_set_keymap('i', '<C-t><C-d>', '<Plug>(copilot-dismiss)', {silent = true, noremap = true})
vim.api.nvim_set_keymap('i', '<C-t><C-s>', '<Plug>(copilot-suggest)', {silent = true, noremap = true})
vim.g['copilot_no_tab_map'] = true
