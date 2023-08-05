vim.opt.signcolumn = "yes"  -- 左端のリンターとか出すところを常に出す
vim.opt.backspace = "indent,eol,start"  -- Backspaceの有効化
vim.opt.whichwrap = "b,s,h,l,<,>,[,]"  -- カーソルが行頭／末にあるときに前／次行に移動できる
vim.opt.lazyredraw = true  -- マクロやコマンドを実行する間、画面を再描画しない(スクロールが重くなる対策)
vim.opt.scrolloff = 10  -- 編集中の箇所の周辺のテキストを見ることができる(スクロールする時に下が見える)
vim.opt.autoread = true  -- 外部でファイルが変更された場合、読み直す
vim.opt.hidden = true  -- bufferを切り替える時に保存してくても警告を出さない
vim.opt.showcmd = true  -- 入力中のコマンド表示
vim.opt.nrformats = "bin,hex"  -- 0で始まる数値を8進数として扱わないようにする
if vim.fn.has("persistent_undo") == 1 then
  vim.o.undodir = vim.fn.expand(vim.fn.stdpath('config') .. '/undo')  -- undoファイルのパス
  vim.o.undofile = true
end
vim.opt.swapfile = false  -- swpファイルをつくらない
vim.opt.termguicolors = true  -- trueカラーを使う
vim.opt.clipboard = "unnamedplus"
if vim.fn.executable('win32yank.exe') == 1 then
  vim.g.clipboard = {
    name = 'myClipboard',
    copy = {
      ['+'] = 'win32yank.exe -i --crlf',
      ['*'] = 'win32yank.exe -i --crlf',
    },
    paste = {
      ['+'] = 'win32yank.exe -o --lf',
      ['*'] = 'win32yank.exe -o --lf',
    },
    cache_enabled = 1,
  }
end
vim.g.mapleader = " "
vim.opt.pumheight = 5  -- 変換候補で表示される数
vim.opt.wrap = false  -- テキストが折り返されないようにする
vim.opt.colorcolumn = "120"  -- カラムにラインを引く
local xdg_cache_home = os.getenv("XDG_CACHE_HOME")
if xdg_cache_home == nil then
    xdg_cache_home = os.getenv("HOME") .. "/.cache"
end
vim.g.netrw_home = xdg_cache_home .. '/nvim'
vim.opt.showmatch = true            -- 閉じ括弧が入力されたとき、対応する開き括弧にわずかの間ジャンプする
vim.opt.matchtime = 1                -- マッチしている括弧を表示するための時間を0.1秒単位で指定する
vim.opt.number = true               -- 毎行の前に行番号を表示する
vim.opt.list = true                 -- 不可視文字を表示する
vim.opt.listchars = "trail:-,extends:»,precedes:«,nbsp:%,eol:↲,space:⋅" -- 不可視文字の設定
vim.opt.display = "lastline"         -- テキスト表示の方法を変える(長いテキストを省略せず最後まで表示する)
vim.opt.laststatus = 2               -- 最下ウィンドウにステータス行を常に表示する
vim.opt.tabstop = 2          -- ファイル内の<Tab>が対応する空白の数
vim.opt.softtabstop = 2      -- <Tab>キーを押した際に挿入されるスペース量
vim.opt.shiftwidth = 2       -- (自動)インデントの各段階に使われる空白の数
vim.opt.smartindent = true   -- 新しい行を作ったときに高度な自動インデントを行う(ex. '{'で終わる行で新しい行を作った時は改行)"
vim.opt.expandtab = true     -- 挿入モードで <Tab> を挿入するとき、代わりに適切な数の空白を使う
vim.opt.smarttab = true      -- 新しい行を作った時に高度なインデントを行う
vim.opt.hlsearch = true            -- 検索語句のハイライト
vim.opt.incsearch = true           -- インクリメントサーチを行う、入力中に検索する
vim.opt.ignorecase = true          -- 検索時に大文字小文字を区別しない
vim.opt.smartcase = true           -- 大文字小文字混在の場合は区別する
vim.opt.wrapscan = true            -- 最後尾まで検索を終えたら次の検索で先頭に移る
vim.opt.inccommand = "split"       -- 置き換え結果previewで見れる
vim.opt.gdefault = true                      -- 置換のgオプションをデフォルトで有効にする
vim.opt.wildmenu = true                      -- Tabによる自動補完を有効にする
vim.opt.wildmode = "list:longest,full"       -- vimからファイルを開く時にtabを押すとリストを表示する
vim.opt.virtualedit = "block"                -- 文字のない所にカーソル移動できる
vim.opt.shellslash = true                    -- ディレクトリパスに/を使えるようにする
vim.opt.fileformats = "unix,dos,mac"         -- エンコーディングの設定
vim.opt.maxfuncdepth = 200                   -- 最大関数呼び出し深度
vim.opt.compatible = false                   -- viとの互換を切る
-- terminalモードから抜ける
vim.api.nvim_set_keymap('t', '<Esc>', '<C-\\><C-n>', {noremap = true})
vim.cmd([[ autocmd TermOpen * startinsert ]])
vim.cmd([[ command! -nargs=* T split | wincmd j | resize 30 | terminal <args> ]])
-- 行末までのヤンク
vim.api.nvim_set_keymap('n', 'Y', 'y$', {noremap = true})
-- NNで検索のハイライトを消す
vim.api.nvim_set_keymap('', 'NN', ':noh<CR>', {noremap = true})
-- 英語配列
vim.api.nvim_set_keymap('', ';', ':', {noremap = true})
vim.api.nvim_set_keymap('', ':', ';', {noremap = true})
vim.api.nvim_set_keymap('v', ';', ':', {noremap = true})
vim.api.nvim_set_keymap('v', ':', ';', {noremap = true})
-- 空の行を挿入
vim.api.nvim_set_keymap('n', 'O', ":<C-u>call append(expand('.'), '')<CR>j", {noremap = true})
-- ヤンクの内容を消さない
vim.api.nvim_set_keymap('', 'PP', '"0p', {noremap = true})
vim.api.nvim_set_keymap('', 'x', '"_x', {noremap = true})
-- 画面分割
vim.api.nvim_set_keymap('n', 'vs', '<Cmd>vsplit<CR>', {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', 'S', '<Cmd>split<CR>', {noremap = true, silent = true})
-- window移動
vim.api.nvim_set_keymap('n', '<C-k>', '<C-w>h', {noremap = true})
vim.api.nvim_set_keymap('n', '<C-t>', '<C-w>j', {noremap = true})
vim.api.nvim_set_keymap('n', '<C-n>', '<C-w>k', {noremap = true})
vim.api.nvim_set_keymap('n', '<C-s>', '<C-w>l', {noremap = true})
-- 矩形選択が貼り付けとコンフリクトするので変更
vim.api.nvim_set_keymap('n', '<C-j>', '<C-v>', {noremap = true})

-- 日本語切替で被るのでvimを止める
vim.api.nvim_set_keymap('i', '<C-space>', '<Nop>', {noremap = true})
-- Astarte配列
vim.api.nvim_set_keymap('n', 'j', 'w', {noremap = true})
vim.api.nvim_set_keymap('v', 'j', 'w', {noremap = true})
-- wrap
vim.api.nvim_set_keymap('n', 'W', '<Cmd>set wrap<CR>', {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', 'WW', '<Cmd>set nowrap<CR>', {noremap = true, silent = true})

-- Terminalはinsertモードで開く
vim.cmd [[
  autocmd TermOpen * startinsert
]]

-- ターミナルをトグルする関数
vim.api.nvim_exec([[
function! ToggleTerminal()
  if &buftype == 'terminal'
    " ターミナルから元のバッファに戻る
    buffer #
  else
    " すでに開いているターミナルバッファがあるか確認
    for buf in range(1, bufnr('$'))
      if getbufvar(buf, '&buftype') == 'terminal'
        execute 'buffer' buf
        return
      endif
    endfor
    " ターミナルバッファがない場合、新しいターミナルを開く
    terminal
  endif
endfunction
]], false)

-- キーマップの設定
vim.api.nvim_set_keymap('n', 'T', ':call ToggleTerminal()<CR>', { noremap = true, silent = true })

-- dein
local CACHE = vim.fn.expand('$HOME/.cache')
if vim.fn.isdirectory(CACHE) == 0 then
  vim.fn.mkdir(CACHE, 'p')
end

if not string.find(vim.o.runtimepath, '/dein.vim') then
  local dein_dir = vim.fn.fnamemodify('dein.vim', ':p')
  if vim.fn.isdirectory(dein_dir) == 0 then
    dein_dir = CACHE .. '/dein/repos/github.com/Shougo/dein.vim'
    if vim.fn.isdirectory(dein_dir) == 0 then
      vim.cmd('!git clone https://github.com/Shougo/dein.vim ' .. dein_dir)
    end
  end
  vim.cmd('set runtimepath^=' .. dein_dir:gsub('[/\\]$', ''))
end

local dein_src = CACHE .. '/dein/repos/github.com/Shougo/dein.vim'
vim.cmd('set runtimepath+=' .. dein_src)

-- Call dein initialization (required)
local dein = require('dein')

dein.setup {
  auto_recache = true,
  install_progress_type = 'floating',
}

local dein_base = CACHE .. '/dein/'
dein.begin(dein_base)

-- 管理するプラグインを記述したファイル
local toml = vim.fn.stdpath('config') .. '/toml/dein.toml'
local lazy_toml = vim.fn.stdpath('config') .. '/toml/dein_lazy.toml'
dein.load_toml(toml, {lazy = 0})
dein.load_toml(lazy_toml, {lazy = 1})

dein.end_()
-- dein終了時に実行する
vim.cmd('syntax enable')
vim.cmd('filetype plugin indent on')
-- hook_post_sourceを呼び出すとき必要
vim.cmd('autocmd VimEnter * call dein#call_hook("post_source")')
-- Golang
vim.api.nvim_exec([[
  autocmd FileType go setlocal noexpandtab
  autocmd FileType go setlocal tabstop=4
  autocmd FileType go setlocal shiftwidth=4
]], false)
