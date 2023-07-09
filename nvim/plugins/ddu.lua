vim.fn['ddu#custom#patch_global']({
  ui = 'ff',
  sources = {
    {
      name = 'file_rec',
      params = {
        ignoredDirectories = {
          '.git',
          'node_modules',
          'vendor',
          '.next',
        }
      }
    },
    { name = 'buffer' },
    { name = 'register' },
    { name = 'mr' },
  },
  sourceOptions = {
    _ = {
      matchers = { 'matcher_substring' },
    },
  },
  filterParams = {
    matcher_substring = {
      highlightMatched = 'Title',
    },
  },
  kindOptions = {
    file = {
      defaultAction = 'open',
    },
  },
  uiParams = {
    ff = {
      startFilter = true,
      prompt = 'λ ',
      split = 'floating',
      autoResize = true,
      floatingBorder = 'rounded',
      displaySourceName = 'long',
    },
  },
})

vim.fn['ddu#custom#patch_local']('grep', {
  sourceParams = {
    rg = {
      args = { '--column', '--no-heading', '--color', 'never', '--json' },
    },
  },
  uiParams = {
    ff = {
      startFilter = false,
    }
  },
})

vim.api.nvim_set_keymap('n', '[ddu]', '', {noremap = true})
vim.api.nvim_set_keymap('n', 'k', '[ddu]', {silent = true})
vim.api.nvim_set_keymap('n', '[ddu]k', ':call ddu#start({}) <CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[ddu]b', ':call ddu#start(#{sources: [#{name: "buffer"}] }) <CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[ddu]m', ':call ddu#start(#{sources: [#{name: "mr"}] }) <CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[ddu]r', ':call ddu#start(#{sources: [#{name: "register"}] }) <CR>', {silent = true, noremap = true})
vim.api.nvim_set_keymap('n', '[ddu]g', ':call ddu#start(#{name: "grep", sources:[#{name: "rg", params: #{input: expand("<cword>")}}] })<CR>', {silent = true, noremap = true})

local ddu_my_ff_settings = function()
  vim.api.nvim_buf_set_keymap(0, 'n', '<CR>', ':call ddu#ui#ff#do_action("itemAction", #{name: "open"})<CR>', {silent = true, noremap = true})
  vim.api.nvim_buf_set_keymap(0, 'n', 'v', ':call ddu#ui#ff#do_action("itemAction", #{name: "open", params: #{command: "vsplit"}})<CR>', {silent = true, noremap = true})
  vim.api.nvim_buf_set_keymap(0, 'n', 's', ':call ddu#ui#ff#do_action("itemAction", #{name: "open", params: #{command: "split"}})<CR>', {silent = true, noremap = true})
  vim.api.nvim_buf_set_keymap(0, 'n', 'i', ':call ddu#ui#ff#do_action("openFilterWindow")<CR>', {silent = true, noremap = true})
  vim.api.nvim_buf_set_keymap(0, 'n', '<Esc>', ':call ddu#ui#ff#do_action("quit")<CR>', {silent = true, noremap = true})
end

_G.ddu_my_ff_settings = ddu_my_ff_settings

vim.api.nvim_exec([[
  augroup ddu_custom
    autocmd!
    autocmd FileType ddu-ff lua _G.ddu_my_ff_settings()
  augroup END
]], false)

local ddu_filter_my_settings = function()
  vim.api.nvim_buf_set_keymap(0, 'i', '<CR>', '<Esc>:call ddu#ui#ff#do_action("closeFilterWindow")<CR>', {noremap = true})
  vim.api.nvim_buf_set_keymap(0, 'n', '<CR>', ':call ddu#ui#ff#do_action("closeFilterWindow")<CR>', {noremap = true})
  vim.api.nvim_buf_set_keymap(0, 'n', '<Esc>', ':call ddu#ui#ff#do_action("closeFilterWindow")<CR>', {noremap = true})
end

_G.ddu_filter_my_settings = ddu_filter_my_settings

vim.api.nvim_exec([[
  augroup ddu_custom_filter
    autocmd!
    autocmd FileType ddu-ff-filter lua _G.ddu_filter_my_settings()
  augroup END
]], false)

