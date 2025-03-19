local M = {}

M.setup = function()
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
        winWidth = math.floor(vim.o.columns * 0.9),
        startFilter = true,
        prompt = '> ',
        split = 'floating',
        autoResize = true,
        floatingBorder = 'rounded',
        displaySourceName = 'short',
        floatingTitle = "Find sources, <v>, <s>, <i>, <p> or <ESC>",
        filterFloatingTitle = "Filter word, <ESC>",
        previewFloating = true,
        previewFloatingBorder = 'rounded',
      },
    },
  })

  vim.fn['ddu#custom#patch_local']('grep', {
    sourceParams = {
      rg = {
        args = { '--json' },
      },
    },
    uiParams = {
      ff = {
        startFilter = false,
      }
    },
  })


  vim.api.nvim_set_keymap('n', '[ddu]', '<Nop>', { noremap = true })
  vim.api.nvim_set_keymap('n', 'k', '[ddu]', {})

  -- GrepActionLua関数の定義
  _G.grep_action = function()
    -- 現在のウィンドウの幅と高さを取得
    local win_width = vim.api.nvim_win_get_width(0)
    local win_height = vim.api.nvim_win_get_height(0)

    -- Floating windowのサイズと位置を計算
    local width = math.floor(win_width * 0.5)
    local height = 2 -- 2行の入力欄
    local row = math.floor((win_height - height) / 2)
    local col = math.floor((win_width - width) / 2)

    -- バッファを作成
    local buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_set_option_value('buftype', 'nofile', { buf = buf })
    vim.api.nvim_set_option_value('bufhidden', 'wipe', { buf = buf })

    -- Floating windowを作成
    local win = vim.api.nvim_open_win(buf, true, {
      title = 'Grep word',
      relative = 'editor',
      width = width,
      height = height,
      row = row,
      col = col,
      border = 'rounded'
    })

    -- ここで挿入モードに入る
    vim.cmd('startinsert')

    _G.finish_input_with_paste_floating = function()
      local content = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
      local input_text = table.concat(content, '\n')
      vim.api.nvim_win_close(win, true)
      -- バッファが存在するかどうかをチェック
      if vim.api.nvim_buf_is_valid(buf) then
        vim.api.nvim_buf_delete(buf, { force = true })
      end

      -- 入力されたテキストを使用してddu#startを呼び出す
      local params = {
        name = 'grep',
        sources = {
          {
            name = 'rg',
            params = {
              input = string.gsub(input_text, "\n", " "),
            },
          },
        },
      }
      vim.fn['ddu#start'](params)
    end

    -- Floating windowのキーマッピング
    vim.api.nvim_buf_set_keymap(buf, 'n', '<CR>', ':lua _G.finish_input_with_paste_floating()<CR>', { noremap = true })
  end

  vim.api.nvim_set_keymap('n', '[ddu]g', ':lua _G.grep_action()<CR>', { noremap = true })


  -- キーマップの設定
  vim.api.nvim_set_keymap('n', '[ddu]k', ':call ddu#start({}) <CR>', { noremap = true })
  vim.api.nvim_set_keymap('n', '[ddu]b', ':call ddu#start(#{sources: [#{name: "buffer"}] }) <CR>', { noremap = true })
  vim.api.nvim_set_keymap('n', '[ddu]m', ':call ddu#start(#{sources: [#{name: "mr"}] }) <CR>', { noremap = true })
  vim.api.nvim_set_keymap('n', '[ddu]r', ':call ddu#start(#{sources: [#{name: "register"}] }) <CR>', { noremap = true })
  vim.api.nvim_set_keymap('n', '[ddu]w',
    ':call ddu#start(#{name: "grep", sources:[#{name: "rg", params: #{input: expand("<cword>")}}] })<CR>',
    { noremap = true })

  _G.ddu_my_ff_settings = function()
    vim.api.nvim_buf_set_keymap(0, 'n', '<CR>', ':call ddu#ui#do_action("itemAction", #{name: "open"})<CR>',
      { noremap = true })
    vim.api.nvim_buf_set_keymap(0, 'n', 'v',
      ':call ddu#ui#do_action("itemAction", #{name: "open", params: #{command: "vsplit"}})<CR>', { noremap = true })
    vim.api.nvim_buf_set_keymap(0, 'n', 's',
      ':call ddu#ui#do_action("itemAction", #{name: "open", params: #{command: "split"}})<CR>', { noremap = true })
    vim.api.nvim_buf_set_keymap(0, 'n', 'i', ':call ddu#ui#do_action("openFilterWindow")<CR>', { noremap = true })
    vim.api.nvim_buf_set_keymap(0, 'n', 'p', ':call ddu#ui#do_action("togglePreview")<CR>', { noremap = true })
    vim.api.nvim_buf_set_keymap(0, 'n', '<Esc>', ':call ddu#ui#do_action("quit")<CR>', { noremap = true })
  end

  vim.cmd([[
    augroup ddu_custom
      autocmd!
      autocmd FileType ddu-ff lua _G.ddu_my_ff_settings()
    augroup END
  ]])

  _G.ddu_filter_my_settings = function()
    vim.api.nvim_buf_set_keymap(0, 'i', '<CR>', '<Esc>:call ddu#ui#do_action("closeFilterWindow")<CR>',
      { noremap = true })
    vim.api.nvim_buf_set_keymap(0, 'n', '<CR>', ':call ddu#ui#do_action("closeFilterWindow")<CR>', { noremap = true })
    vim.api.nvim_buf_set_keymap(0, 'n', '<Esc>', ':call ddu#ui#do_action("closeFilterWindow")<CR>', { noremap = true })
  end

  vim.cmd([[
    augroup ddu_custom_filter
      autocmd!
      autocmd FileType ddu-ff-filter lua _G.ddu_filter_my_settings()
    augroup END
  ]])
end

return M
