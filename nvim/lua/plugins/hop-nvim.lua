local M = {}

M.setup = function()
  local hop = require('hop')
  local directions = require('hop.hint').HintDirection

  -- hop.nvimの基本設定
  hop.setup({
    keys = 'yacdtlue\'hnf',  -- キーボードレイアウトに応じて調整可能
    multi_windows = true,    -- 複数ウィンドウ対応
    case_insensitive = true, -- スマートケース
  })

  -- よく使う機能を単一キーに割り当て
  -- 's' キーで2文字入力ジャンプ（最も汎用的な機能）
  vim.api.nvim_set_keymap('n', 's', '<cmd>HopChar2<CR>', { noremap = true })
  vim.api.nvim_set_keymap('v', 's', '<cmd>HopChar2<CR>', { noremap = true })


  -- プレフィックスキーを使った追加機能
  vim.api.nvim_set_keymap('n', '[Hop]', '<Nop>', {})
  vim.api.nvim_set_keymap('n', 't', '[Hop]', {})

  -- '行内の任意の文字にジャンプ
  vim.keymap.set('n', 'ts', function()
    hop.hint_char1({ direction = directions.AFTER_CURSOR, current_line_only = true })
  end, { noremap = true })

  vim.keymap.set('n', 'tk', function()
    hop.hint_char1({ direction = directions.BEFORE_CURSOR, current_line_only = true })
  end, { noremap = true })

  -- 行ジャンプ(カーソル下)
  vim.keymap.set('n', 'tt', function()
    hop.hint_lines({ direction = directions.AFTER_CURSOR })
  end, { noremap = true })
  vim.keymap.set('v', 'tt', function()
    hop.hint_lines({ direction = directions.AFTER_CURSOR })
  end, { noremap = true })
  -- 行ジャンプ(カーソル上)
  vim.keymap.set('n', 'tn', function()
    hop.hint_lines({ direction = directions.BEFORE_CURSOR })
  end, { noremap = true })
  vim.keymap.set('v', 'tn', function()
    hop.hint_lines({ direction = directions.BEFORE_CURSOR })
  end, { noremap = true })

  -- 単語ジャンプ
  vim.keymap.set('n', 'tl', function()
    hop.hint_words()
  end, { noremap = true })
  vim.keymap.set('v', 'tl', function()
    hop.hint_words()
  end, { noremap = true })
end

return M
