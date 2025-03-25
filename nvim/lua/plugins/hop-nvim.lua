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
  vim.keymap.set({ 'n', 'v' }, 's', '<cmd>HopChar2<CR>', { noremap = true })

  -- プレフィックスキーを使った追加機能
  vim.keymap.set('n', '[Hop]', '<Nop>', { noremap = true })
  vim.keymap.set('n', 't', '[Hop]', { remap = true })

  -- '行内の任意の文字にジャンプ
  vim.keymap.set('n', '[Hop]s', function()
    hop.hint_char1({ direction = directions.AFTER_CURSOR, current_line_only = true })
  end, { noremap = true })
  vim.keymap.set('n', '[Hop]k', function()
    hop.hint_char1({ direction = directions.BEFORE_CURSOR, current_line_only = true })
  end, { noremap = true })
  -- 行ジャンプ(カーソル下)
  vim.keymap.set({ 'n', 'v' }, '[Hop]t', function()
    hop.hint_lines({ direction = directions.AFTER_CURSOR })
  end, { noremap = true })
  -- 行ジャンプ(カーソル上)
  vim.keymap.set({ 'n', 'v' }, '[Hop]n', function()
    hop.hint_lines({ direction = directions.BEFORE_CURSOR })
  end, { noremap = true })
  -- 単語ジャンプ
  vim.keymap.set({ 'n', 'v' }, '[Hop]l', function()
    hop.hint_words()
  end, { noremap = true })
end

return M
