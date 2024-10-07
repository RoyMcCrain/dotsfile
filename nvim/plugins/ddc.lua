vim.fn['ddc#custom#patch_global']({
  ui = 'pum',
  autoCompleteEvents = {
    'InsertEnter', 'TextChangedI', 'TextChangedP', 'CmdlineChanged'
  },
  cmdlineSources = {
    [':'] = { 'cmdline', 'cmdline-history', 'around' }
  }
})

-- vim.fn['ddc#custom#patch_global']('sources', { 'copilot', 'lsp', 'buffer' })
vim.fn['ddc#custom#patch_global']('sources', { 'lsp', 'buffer' })

vim.fn['ddc#custom#patch_global']('sourceOptions', {
  -- copilot = {
  --   matchers = {},
  --   mark = 'CP',
  --   minAutoCompleteLength = 0,
  --   isVolatile = true,
  -- },
  lsp = {
    dup = 'keep',
    mark = 'LSP',
    sorters = { 'sorter_lsp-kind' },
  },
  buffer = { mark = 'B' },
  cmdline = { mark = 'CMD' },
  ['cmdline-history'] = { mark = 'H' },
  around = { mark = 'A' },
  _ = {
    matchers = { 'matcher_fuzzy' },
    sorters = { 'sorter_rank' },
    converters = { 'converter_remove_overlap' },
  },
})

vim.fn['ddc#custom#patch_global']('sourceParams', {
  lsp = {
    enableResolveItem = true,
    enableAdditionalTextEdit = true,
    snippetEngine = '',
  },
  buffer = {
    requireSameFiletype = false,
    limitBytes = 5000000,
    fromAltBuf = true,
    forceCollect = true,
  }
})


vim.fn['ddc#custom#patch_global']('filterParams', {
  matcher_fuzzy = { camelcase = true },
  ['sorter_lsp-kind'] = {
    priority = {
      'Keyword',
      'Variable',
      'Field',
      { 'Function', 'Method' },
      'Enum',
    },
  }
})

vim.fn['ddc#enable']()

vim.api.nvim_set_keymap('i', '<C-n>', '<Cmd>call pum#map#insert_relative(+1)<CR>', { noremap = true })
vim.api.nvim_set_keymap('i', '<C-p>', '<Cmd>call pum#map#insert_relative(-1)<CR>', { noremap = true })
vim.api.nvim_set_keymap('i', '<C-k>', '<Cmd>call pum#map#confirm()<CR>', { noremap = true })
vim.api.nvim_set_keymap('i', '<C-e>', '<Cmd>call pum#map#cancel()<CR>', { noremap = true })
vim.api.nvim_set_keymap('i', '<PageDown>', '<Cmd>call pum#map#insert_relative(+1)<CR>', { noremap = true })
vim.api.nvim_set_keymap('i', '<PageUp>', '<Cmd>call pum#map#insert_relative(-1)<CR>', { noremap = true })

vim.api.nvim_set_keymap('n', ':', '<Cmd>lua CommandlinePre()<CR>:', { noremap = true })
vim.api.nvim_set_keymap('n', ';', '<Cmd>lua CommandlinePre()<CR>:', { noremap = true })

function CommandlinePost()
  vim.api.nvim_del_keymap('c', '<Tab>')
  vim.api.nvim_del_keymap('c', '<S-Tab>')
  vim.api.nvim_del_keymap('c', '<C-n>')
  vim.api.nvim_del_keymap('c', '<C-p>')
  vim.api.nvim_del_keymap('c', '<C-y>')
  vim.api.nvim_del_keymap('c', '<C-e>')
end

function CommandlinePre()
  vim.api.nvim_set_keymap('c', '<Tab>', '<Cmd>lua vim.fn["pum#map#insert_relative"](1)<CR>', { noremap = true })
  vim.api.nvim_set_keymap('c', '<S-Tab>', '<Cmd>lua vim.fn["pum#map#insert_relative"](-1)<CR>', { noremap = true })
  vim.api.nvim_set_keymap('c', '<C-n>', '<Cmd>lua vim.fn["pum#map#insert_relative"](1)<CR>', { noremap = true })
  vim.api.nvim_set_keymap('c', '<C-p>', '<Cmd>lua vim.fn["pum#map#insert_relative"](-1)<CR>', { noremap = true })
  vim.api.nvim_set_keymap('c', '<C-y>', '<Cmd>lua vim.fn["pum#map#confirm"]()<CR>', { noremap = true })
  vim.api.nvim_set_keymap('c', '<C-e>', '<Cmd>lua vim.fn["pum#map#cancel"]()<CR>', { noremap = true })

  vim.api.nvim_create_autocmd('User', {
    pattern = 'DDCCmdlineLeave',
    callback = function()
      CommandlinePost()
    end,
    once = true,
  })

  vim.fn['ddc#enable_cmdline_completion']()
end
