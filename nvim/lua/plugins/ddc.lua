local M = {}

M.setup = function()
  -- シンプルなddc設定（enum補完の複雑な設定を削除）
  vim.fn['ddc#custom#patch_global']({
    ui = 'pum',
    autoCompleteEvents = {
      'InsertEnter', 'TextChangedI', 'TextChangedP', 'CmdlineChanged'
    },
    cmdlineSources = {
      [':'] = { 'cmdline', 'cmdline_history', 'around' }
    }
  })

  vim.fn['ddc#custom#patch_global']('sources', { 'lsp', 'buffer' })

  vim.fn['ddc#custom#patch_global']('sourceOptions', {
    lsp = {
      dup = 'keep',
      mark = 'LSP',
      sorters = { 'sorter_lsp-kind' },
      minAutoCompleteLength = 1,
      forceCompletionPattern = '\\.\\w*|:\\w*|->\\w*|<\\w*',
      maxItems = 10,
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
        'Field',     -- オブジェクトプロパティ
        'Method',    -- メソッド
        'Variable',  -- 変数
        'Function',  -- 関数
        'Constant',  -- 定数
        'Keyword',   -- キーワード
        'Interface', -- インターフェース
        'Class',     -- クラス
      },
    }
  })

  vim.fn['ddc#enable']()

  vim.keymap.set('i', '<C-n>', '<Cmd>call pum#map#insert_relative(+1)<CR>', { noremap = true })
  vim.keymap.set('i', '<C-p>', '<Cmd>call pum#map#insert_relative(-1)<CR>', { noremap = true })
  vim.keymap.set('i', '<C-k>', '<Cmd>call pum#map#confirm()<CR>', { noremap = true })
  vim.keymap.set('i', '<C-e>', '<Cmd>call pum#map#cancel()<CR>', { noremap = true })
  vim.keymap.set('i', '<PageDown>', '<Cmd>call pum#map#insert_relative(+1)<CR>', { noremap = true })
  vim.keymap.set('i', '<PageUp>', '<Cmd>call pum#map#insert_relative(-1)<CR>', { noremap = true })

  vim.keymap.set('n', ':', '<Cmd>lua CommandlinePre()<CR>:', { noremap = true })
  vim.keymap.set('n', ';', '<Cmd>lua CommandlinePre()<CR>:', { noremap = true })

  function CommandlinePost()
    vim.keymap.del('c', '<Tab>')
    vim.keymap.del('c', '<S-Tab>')
    vim.keymap.del('c', '<C-n>')
    vim.keymap.del('c', '<C-p>')
    vim.keymap.del('c', '<C-y>')
    vim.keymap.del('c', '<C-e>')
  end

  function CommandlinePre()
    vim.keymap.set('c', '<Tab>', '<Cmd>lua vim.fn["pum#map#insert_relative"](1)<CR>', { noremap = true })
    vim.keymap.set('c', '<S-Tab>', '<Cmd>lua vim.fn["pum#map#insert_relative"](-1)<CR>', { noremap = true })
    vim.keymap.set('c', '<C-n>', '<Cmd>lua vim.fn["pum#map#insert_relative"](1)<CR>', { noremap = true })
    vim.keymap.set('c', '<C-p>', '<Cmd>lua vim.fn["pum#map#insert_relative"](-1)<CR>', { noremap = true })
    vim.keymap.set('c', '<C-y>', '<Cmd>lua vim.fn["pum#map#confirm"]()<CR>', { noremap = true })
    vim.keymap.set('c', '<C-e>', '<Cmd>lua vim.fn["pum#map#cancel"]()<CR>', { noremap = true })

    vim.api.nvim_create_autocmd('User', {
      pattern = 'DDCCmdlineLeave',
      callback = function()
        CommandlinePost()
      end,
      once = true,
    })

    vim.fn['ddc#enable_cmdline_completion']()
  end
end

return M
