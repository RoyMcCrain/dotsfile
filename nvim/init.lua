vim.opt.signcolumn = "yes"             -- 左端のリンターとか出すところを常に出す
vim.opt.backspace = "indent,eol,start" -- Backspaceの有効化
vim.opt.whichwrap = "b,s,h,l,<,>,[,]"  -- カーソルが行頭／末にあるときに前／次行に移動できる
vim.opt.lazyredraw = true              -- マクロやコマンドを実行する間、画面を再描画しない(スクロールが重くなる対策)
vim.opt.scrolloff = 10                 -- 編集中の箇所の周辺のテキストを見ることができる(スクロールする時に下が見える)
vim.opt.autoread = true                -- 外部でファイルが変更された場合、読み直す
vim.opt.hidden = true                  -- bufferを切り替える時に保存してくても警告を出さない
vim.opt.showcmd = true                 -- 入力中のコマンド表示
vim.opt.nrformats = "bin,hex"          -- 0で始まる数値を8進数として扱わないようにする

if vim.fn.has("persistent_undo") == 1 then
  vim.o.undodir = vim.fn.expand(vim.fn.stdpath('config') .. '/undo') -- undoファイルのパス
  vim.o.undofile = true
end

vim.cmd([[
  command! Doc execute 'tabnew +setlocal\ readonly\ nomodifiable' stdpath('config') . '/doc/keymaps.txt'
]])

vim.opt.swapfile = false     -- swpファイルをつくらない
vim.opt.termguicolors = true -- trueカラーを使う
vim.opt.clipboard = "unnamedplus"

if vim.fn.has('wsl') == 1 then
  vim.g.clipboard = {
    name = 'WslClipboard',
    copy = {
      ['+'] = 'clip.exe',
      ['*'] = 'clip.exe',
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
vim.api.nvim_set_keymap('t', '<Esc>', '<C-\\><C-n>', { noremap = true })
vim.cmd('autocmd TermOpen * startinsert')
vim.cmd('command! -nargs=* T split | wincmd j | resize 30 | terminal <args>')
-- 行末までのヤンク
vim.api.nvim_set_keymap('n', 'Y', 'y$', { noremap = true })
-- NNで検索のハイライトを消す
vim.api.nvim_set_keymap('n', 'NN', ':noh<CR>', { noremap = true })
-- 英語配列
vim.keymap.set('n', ';', ':', { noremap = true })
vim.keymap.set('n', ':', ';', { noremap = true })
vim.keymap.set('v', ';', ':', { noremap = true })
vim.keymap.set('v', ':', ';', { noremap = true })
-- 空の行を挿入
vim.api.nvim_set_keymap('n', 'O', [[<cmd>call append(line('.'), '')<CR><cmd>normal! j^<CR>]], { noremap = true })
-- ヤンクの内容を消さない
vim.api.nvim_set_keymap('n', 'P', 'o<Esc>"+p', { noremap = true })
vim.api.nvim_set_keymap('n', 'x', '"_x', { noremap = true })
-- 画面分割
vim.api.nvim_set_keymap('n', 'vs', '<Cmd>vsplit<CR>', { noremap = true })
vim.api.nvim_set_keymap('n', 'S', '<Cmd>split<CR>', { noremap = true })
-- window移動
vim.api.nvim_set_keymap('n', '<C-k>', '<C-w>h', { noremap = true })
vim.api.nvim_set_keymap('n', '<C-t>', '<C-w>j', { noremap = true })
vim.api.nvim_set_keymap('n', '<C-n>', '<C-w>k', { noremap = true })
vim.api.nvim_set_keymap('n', '<C-s>', '<C-w>l', { noremap = true })
-- 矩形選択が貼り付けとコンフリクトするので変更
vim.api.nvim_set_keymap('n', '<C-j>', '<C-v>', { noremap = true })

-- 日本語切替で被るのでvimを止める
vim.api.nvim_set_keymap('i', '<C-space>', '<Nop>', { noremap = true })
-- Astarte配列
vim.api.nvim_set_keymap('n', 'j', 'w', { noremap = true })
vim.api.nvim_set_keymap('v', 'j', 'w', { noremap = true })
-- wrap
vim.api.nvim_set_keymap('n', 'W', '<Cmd>set wrap<CR>', { noremap = true })
vim.api.nvim_set_keymap('n', 'WW', '<Cmd>set nowrap<CR>', { noremap = true })

-- Terminalはinsertモードで開く
vim.cmd('autocmd TermOpen * startinsert')

-- ターミナルをトグルする関数
vim.cmd([[
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
]])

-- キーマップの設定
vim.api.nvim_set_keymap('n', 'T', ':call ToggleTerminal()<CR>', { noremap = true })

-- dpp.vim

local CACHE = vim.fn.expand('$HOME/.cache')
if type(CACHE) == 'string' and vim.fn.isdirectory(CACHE) == 0 then
  vim.fn.mkdir(CACHE, 'p')
end
-- Set dpp base path (required)
local dpp_base = CACHE .. '/dpp'

if not string.find(vim.o.runtimepath, '/dpp.vim') then
  local dpp_dir = dpp_base .. '/repos/github.com/Shougo/'
  if vim.fn.isdirectory(vim.fn.fnamemodify('dpp.vim', ':p')) == 0 then
    if vim.fn.isdirectory(dpp_dir) == 0 then
      vim.cmd('!git clone https://github.com/Shougo/dpp.vim' .. ' ' .. dpp_dir .. 'dpp.vim')
      vim.cmd('!git clone https://github.com/Shougo/dpp-ext-installer' .. ' ' .. dpp_dir .. 'dpp-ext-installer')
      vim.cmd('!git clone https://github.com/Shougo/dpp-ext-lazy' .. ' ' .. dpp_dir .. 'dpp-ext-lazy')
      vim.cmd('!git clone https://github.com/Shougo/dpp-ext-toml' .. ' ' .. dpp_dir .. 'dpp-ext-toml')
      vim.cmd('!git clone https://github.com/Shougo/dpp-protocol-git' .. ' ' .. dpp_dir .. 'dpp-protocol-git')
    end
  end
  vim.opt.runtimepath:prepend(dpp_dir .. 'dpp.vim')
  vim.opt.runtimepath:append(dpp_dir .. 'dpp-ext-installer')
  vim.opt.runtimepath:append(dpp_dir .. 'dpp-ext-lazy')
  vim.opt.runtimepath:append(dpp_dir .. 'dpp-ext-toml')
  vim.opt.runtimepath:append(dpp_dir .. 'dpp-protocol-git')
end

-- Load dpp state
if vim.fn["dpp#min#load_state"](dpp_base) then
  if not string.find(vim.o.runtimepath, '/denops.vim') then
    local denops_src = dpp_base .. '/repos/github.com/vim-denops/denops.vim'
    if vim.fn.isdirectory(vim.fn.fnamemodify('denops.vim', ':p')) == 0 then
      if vim.fn.isdirectory(denops_src) == 0 then
        vim.cmd('!git clone https://github.com/vim-denops/denops.vim ' .. denops_src)
      end
    end
    vim.opt.runtimepath:prepend(denops_src)
  end

  local config_dir = vim.fn.stdpath('config') .. '/plugins/dpp.ts'
  vim.api.nvim_command('autocmd User DenopsReady call dpp#make_state("' .. dpp_base .. '", "' .. config_dir .. '")')
end

-- Enable filetype indent and plugin
vim.cmd('filetype indent plugin on')

-- Enable syntax highlighting
if vim.fn.has('syntax') then
  vim.cmd('syntax on')
end

vim.api.nvim_create_user_command('DppInstall', function()
  vim.fn['dpp#async_ext_action']('installer', 'install')
end, {})

vim.api.nvim_create_user_command('DppUpdate', function()
  vim.fn['dpp#async_ext_action']('installer', 'update')
end, {})


-- Golang
vim.cmd([[
	autocmd FileType go setlocal tabstop=4
	autocmd FileType go setlocal shiftwidth=4
]])

-- prettier 設定
vim.api.nvim_create_user_command('Prettier', function()
  local filetypes = {
    "css", "scss", "html", "markdown", "javascript", "json", "yaml", "typescript", "vue", "svelte", "graphql", "php",
    "typescript", "javascriptreact", "typescriptreact"
  }

  local buf_filetype = vim.api.nvim_get_option_value('filetype', { buf = 0 })
  local file_path = vim.fn.expand('%:p')

  for _, filetype in pairs(filetypes) do
    if buf_filetype == filetype then
      local cmd
      if vim.fn.executable("bunx") == 1 then
        cmd = 'bunx prettier --write ' .. vim.fn.shellescape(file_path)
      else
        vim.api.nvim_err_writeln("エラー: bunxが利用できません。")
        return
      end

      local output = vim.fn.system(cmd)
      local exit_code = vim.v.shell_error

      if exit_code == 0 then
        vim.cmd('e') -- ファイルを再読み込み
        print("Prettierによるフォーマットが完了しました。")
      else
        vim.api.nvim_err_writeln("エラー: Prettierのフォーマットに失敗しました。")
        vim.api.nvim_err_writeln(output)
      end
      return
    end
  end
  print("現在のファイルタイプはPrettierでサポートされていません。")
end, {})
-- nvim/lua/にtiktokenのバイナリを配置したので読み込む
package.cpath = package.cpath .. ';' .. vim.fn.expand('~/.config/nvim/lua/?.so')
