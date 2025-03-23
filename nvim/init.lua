vim.opt.signcolumn = "yes"             -- 左端のリンターとか出すところを常に出す
vim.opt.backspace = "indent,eol,start" -- Backspaceの有効化
vim.opt.whichwrap = "b,s,h,l,<,>,[,]"  -- カーソルが行頭／末にあるときに前／次行に移動できる
vim.opt.lazyredraw = true              -- マクロやコマンドを実行する間、画面を再描画しない(スクロールが重くなる対策)
vim.opt.scrolloff = 20                 -- 編集中の箇所の周辺のテキストを見ることができる(スクロールする時に下が見える)
vim.opt.autoread = true                -- 外部でファイルが変更された場合、読み直す
vim.opt.hidden = true                  -- bufferを切り替える時に保存してくても警告を出さない
vim.opt.showcmd = true                 -- 入力中のコマンド表示
vim.opt.nrformats = "bin,hex"          -- 0で始まる数値を8進数として扱わないようにする

if vim.fn.has("persistent_undo") == 1 then
  vim.o.undodir = vim.fn.expand(vim.fn.stdpath('config') .. '/undo') -- undoファイルのパス
  vim.o.undofile = true
end

vim.api.nvim_create_user_command('Doc', function()
  local doc_path = vim.fn.stdpath('config') .. '/doc/keymaps.txt'
  vim.cmd('tabnew ' .. doc_path)
  vim.bo.readonly = true
  vim.bo.modifiable = false
end, {})

vim.opt.swapfile = false     -- swpファイルをつくらない
vim.opt.termguicolors = true -- trueカラーを使う
vim.opt.clipboard = "unnamedplus"

if vim.fn.has('wsl') == 1 then
  if vim.fn.executable('xsel') == 1 then
    vim.g.clipboard = {
      name = 'WslClipboard',
      copy = {
        ['+'] = 'xsel -bi',
        ['*'] = 'xsel -bi',
      },
      paste = {
        ['+'] = function() return vim.fn.systemlist('xsel -bo | tr -d "\r"') end,
        ['*'] = function() return vim.fn.systemlist('xsel -bo | tr -d "\r"') end,
      },
      cache_enabled = 1,
    }
  else
    print("xselが入ってない")
    vim.g.clipboard = {
      name = 'WslClipboard',
      copy = {
        ['+'] = function(lines)
          local text = table.concat(lines, "\n")
          text = vim.fn.iconv(text, "utf-8", "cp932")
          vim.fn.system('clip.exe', text)
        end,
        ['*'] = function(lines)
          local text = table.concat(lines, "\n")
          text = vim.fn.iconv(text, "utf-8", "cp932")
          vim.fn.system('clip.exe', text)
        end,
      },
      paste = {
        ['+'] = function()
          return vim.split(vim.fn.getreg('"'), '\n')
        end,
        ['*'] = function()
          return vim.split(vim.fn.getreg('"'), '\n')
        end,
      },
      cache_enabled = false,
    }
  end
end
vim.g.mapleader = " "
vim.opt.pumheight = 5       -- 変換候補で表示される数
vim.opt.wrap = false        -- テキストが折り返されないようにする
vim.opt.colorcolumn = "120" -- カラムにラインを引く
local xdg_cache_home = os.getenv("XDG_CACHE_HOME")
if xdg_cache_home == nil then
  xdg_cache_home = os.getenv("HOME") .. "/.cache"
end
vim.g.netrw_home = xdg_cache_home .. '/nvim'
vim.opt.showmatch = true -- 閉じ括弧が入力されたとき、対応する開き括弧にわずかの間ジャンプする
vim.opt.matchtime = 1 -- マッチしている括弧を表示するための時間を0.1秒単位で指定する
vim.opt.number = true -- 毎行の前に行番号を表示する
vim.opt.list = true -- 不可視文字を表示する
vim.opt.listchars = "trail:-,extends:»,precedes:«,nbsp:%,eol:↲,tab:▸•,space:∙" -- 不可視文字の設定
vim.opt.display = "lastline" -- テキスト表示の方法を変える(長いテキストを省略せず最後まで表示する)
vim.opt.laststatus = 2 -- 最下ウィンドウにステータス行を常に表示する
vim.opt.tabstop = 2 -- ファイル内の<Tab>が対応する空白の数
vim.opt.softtabstop = 2 -- <Tab>キーを押した際に挿入されるスペース量
vim.opt.shiftwidth = 2 -- (自動)インデントの各段階に使われる空白の数
vim.opt.expandtab = true -- タブをスペースに変換する
vim.opt.smartindent = true -- 新しい行を作ったときに高度な自動インデントを行う(ex. '{'で終わる行で新しい行を作った時は改行)"
vim.opt.smarttab = true -- 新しい行を作った時に高度なインデントを行う
vim.opt.hlsearch = true -- 検索語句のハイライト
vim.opt.incsearch = true -- インクリメントサーチを行う、入力中に検索する
vim.opt.ignorecase = true -- 検索時に大文字小文字を区別しない
vim.opt.smartcase = true -- 大文字小文字混在の場合は区別する
vim.opt.wrapscan = true -- 最後尾まで検索を終えたら次の検索で先頭に移る
vim.opt.inccommand = "split" -- 置き換え結果previewで見れる
vim.opt.gdefault = true -- 置換のgオプションをデフォルトで有効にする
vim.opt.wildmode = "list:longest,full" -- vimからファイルを開く時にtabを押すとリストを表示する
vim.opt.virtualedit = "block" -- 文字のない所にカーソル移動できる
vim.opt.fileformats = "unix,dos,mac" -- エンコーディングの設定
vim.opt.maxfuncdepth = 200 -- 最大関数呼び出し深度
vim.opt.compatible = false -- viとの互換を切る
-- terminalモードから抜ける
vim.keymap.set('t', '<Esc>', '<C-\\><C-n>', { noremap = true })
-- Terminalはinsertモードで開く
vim.api.nvim_create_autocmd("TermOpen", {
  pattern = "*",
  command = "startinsert"
})

-- 行末までのヤンク
vim.keymap.set('n', 'Y', 'y$', { noremap = true })
-- NNで検索のハイライトを消す
vim.keymap.set('n', 'NN', ':noh<CR>', { noremap = true })
-- 英語配列
vim.keymap.set('n', ';', ':', { noremap = true })
vim.keymap.set('n', ':', ';', { noremap = true })
vim.keymap.set('v', ';', ':', { noremap = true })
vim.keymap.set('v', ':', ';', { noremap = true })
-- 空の行を挿入
vim.keymap.set('n', 'O', function()
  vim.api.nvim_call_function('append', { vim.fn.line('.'), '' })
  vim.cmd('normal! j^')
end, { noremap = true })

-- ヤンクの内容を消さない
vim.keymap.set('n', 'P', 'o<Esc>"+p', { noremap = true })
vim.keymap.set('n', 'x', '"_x', { noremap = true })

-- 画面分割
vim.keymap.set('n', 'vs', '<Cmd>vsplit<CR>', { noremap = true })
vim.keymap.set('n', 'S', '<Cmd>split<CR>', { noremap = true })

-- window移動
vim.keymap.set('n', '<C-k>', '<C-w>h', { noremap = true })
vim.keymap.set('n', '<C-t>', '<C-w>j', { noremap = true })
vim.keymap.set('n', '<C-n>', '<C-w>k', { noremap = true })
vim.keymap.set('n', '<C-s>', '<C-w>l', { noremap = true })

-- 矩形選択が貼り付けとコンフリクトするので変更
vim.keymap.set('n', '<C-j>', '<C-v>', { noremap = true })

-- 日本語切替で被るのでvimを止める
vim.keymap.set('i', '<C-space>', '<Nop>', { noremap = true })

-- Astarte配列
vim.keymap.set({ 'n', 'v' }, 'j', 'w', { noremap = true })

-- wrap
vim.keymap.set('n', 'W', '<Cmd>set wrap<CR>', { noremap = true })
vim.keymap.set('n', 'WW', '<Cmd>set nowrap<CR>', { noremap = true })

local func = require('custom-function')
-- コマンドの設定
vim.api.nvim_create_user_command('Term', func.toggle_terminal, {})
-- prettier 設定
vim.api.nvim_create_user_command('Prettier', func.pritter, {})
-- rustywind(tailwindcssのクラス名ソート)
vim.api.nvim_create_user_command('SortTw', func.sort_tailwind_class, {})
-- vscodeで開く
vim.api.nvim_create_user_command('Code', func.open_in_code, {})

-- dpp.vim
-- filetype plugin indent onはneovimはデフォルトで有効
-- syntax onはtree-sitterを使うので不要
require('dpp-vim').setup()
-- Golang
vim.api.nvim_create_autocmd("FileType", {
  pattern = "go",
  callback = function()
    vim.bo.tabstop = 4
    vim.bo.shiftwidth = 4
  end
})

-- filetypeの設定
vim.filetype.add({
  filename = {
    ['Procfile'] = 'bash',
  }
})
