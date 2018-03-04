"-------------------------------------------
"-------------------------------------------

"-------------------------------------------------------------------------------
" Vim Options
"-------------------------------------------------------------------------------
" Basic
set backspace=indent,eol,start    " Backspaceの有効化
set whichwrap=b,s,h,l,<,>,[,]     " カーソルが行頭／末にあるときに前／次行に移動できる
set lazyredraw                    " マクロやコマンドを実行する間、画面を再描画しない(スクロールが重くなる対策)
set ttyfast                       " 高速ターミナル接続を行う(スクロールが重くなる対策)
set scrolloff=10                  " 編集中の箇所の周辺のテキストを見ることができる(スクロールする時に下が見える)
set autoread                      " 外部でファイルが変更された場合、読み直す
set hidden                        " bufferを切り替える時に保存してくても警告を出さない
set showcmd                       " 入力中のコマンド表示
set nrformats-=octal              " 0で始まる数値を8進数として扱わないようにする
set undodir=~/.config/nvim/undo         " undoファイルのパス
set directory=~/.config/nvim/swp/        " swpファイルのパス
set termguicolors                 " trueカラーを使う
set clipboard+=unnamedplus
let mapleader = "\<Space>"

" View
set showmatch                       " 閉じ括弧が入力されたとき、対応する開き括弧にわずかの間ジャンプする
set matchtime=1                     " マッチしている括弧を表示するための時間を0.1秒単位で指定する
set number                          " 毎行の前に行番号を表示する
set list                            " 不可視文字を表示する
set listchars=trail:-,extends:»,precedes:«,nbsp:%,eol:↲

set display=lastline                " テキスト表示の方法を変える(長いテキストを省略せず最後まで表示する)
set laststatus=2                    " 最下ウィンドウにステータス行を常に表示する

" Indent
set tabstop=2           " ファイル内の<Tab>が対応する空白の数
set softtabstop=2       " <Tab>キーを押した際に挿入されるスペース量
set autoindent          " 新しい行を開始したとき新しい行のインデントを現在行と同じくする
set shiftwidth=2        " (自動)インデントの各段階に使われる空白の数
set smartindent         " 新しい行を作ったときに高度な自動インデントを行う(ex. '{'で終わる行で新しい行を作った時は改行)"
set expandtab           " 挿入モードで <Tab> を挿入するとき、代わりに適切な数の空白を使う
set ambiwidth=double    " 文脈によって解釈が異なる全角文字の幅を、2に固定する
set smarttab            " 新しい行を作った時に高度なインデントを行う


" search
set hlsearch                      " 検索語句のハイライト
set incsearch                     " インクリメントサーチを行う、入力中に検索する
set ignorecase                    " 検索時に大文字小文字を区別しない
set smartcase                     " 大文字小文字混在の場合は区別する
set wrapscan                      " 最後尾まで検索を終えたら次の検索で先頭に移る


" special
set gdefault                            " 置換のgオプションをデフォルトで有効にする
set wildmenu wildmode=longest:full,full " vimからファイルを開く時にtabを押すとリストを表示する
set virtualedit=block                   " 文字のない所にカーソル移動できる
set sh=zsh


" windows設定
set shellslash   "ディレクトリパスに/を使えるようにする


" エンコーディングの設定
set encoding=utf-8
set fileformats=unix,dos,mac

" ビープ音
set visualbell t_vb=
set noerrorbells

" neovim
tnoremap <silent> <C-[> <C-\><C-n>    " <C-[>でterminalモードから抜ける
inoremap [ []<LEFT>
inoremap [<Enter> []<Left><CR><ESC><S-o>
inoremap " ""<LEFT>
inoremap ' ''<LEFT>

inoremap { {<space>}<Left><Left>
inoremap {<Enter> {}<Left><CR><ESC><S-o>
inoremap ( ()<ESC>i
inoremap (<Enter> ()<Left><CR><ESC><S-o>
" 英語配列用
noremap; :
noremap: ;
" 空の行を挿入
nnoremap O :<C-u>call append(expand('.'), '')<Cr>j
" 行末、行頭のエイリアス
noremap <Leader>a ^
noremap <Leader>e $
" ヤンクの内容を消さない設定
noremap PP "0p
noremap x "_x



if &compatible
  set nocompatible               " Be iMproved
endif

set runtimepath+=~/.config/nvim/plugins/repos/github.com/Shougo/dein.vim

" Required:
if dein#load_state('~/.config/nvim/plugins/')
  call dein#begin('~/.config/nvim/plugins/')

  " Let dein manage dein
  " Required:
  call dein#add('~/.config/nvim/plugins/repos/github.com/Shougo/dein.vim')
  call dein#add('Shougo/vimproc.vim',{'build' : 'make' })


  " 管理するプラグインを記述したファイル
  let s:toml = '~/.config/nvim/toml/dein.toml'
  let s:lazy_toml = '~/.config/nvim/toml/dein_lazy.toml'
  call dein#load_toml(s:toml, {'lazy': 0})
  call dein#load_toml(s:lazy_toml, {'lazy': 1})

  call dein#end()
  call dein#save_state()
endif

syntax enable
filetype plugin indent on
colorscheme tender
let g:lightline = { 'colorscheme': 'tender' }
let g:airline_theme =  'tender'


" Tell Neosnippet about the other snippets
let g:neosnippet#enable_snipmate_compatibility = 1

" auto-ctagsの設定
let g:auto_ctags = 1
let g:auto_ctags_tags_name = 'tags'
let g:auto_ctags_directory_list = ['.git', '.svn']
"tagsファイル読み込み
set tags+=.git/tags

" vim-slimの設定
autocmd BufRead,BufNewFile *.slim setfiletype slim

"vim-indent-guides""
let g:indent_guides_enable_on_vim_startup = 1
let g:indent_guides_start_level=2

"caw.vim"

" 行の最初の文字の前にコメント文字をトグル
nmap <Leader>/ <Plug>(caw:hatpos:toggle)
vmap <Leader>/ <Plug>(caw:hatpos:toggle)
" 行頭にコメントをトグル
nmap <Leader>0 <Plug>(caw:zeropos:toggle)
vmap <Leader>0 <Plug>(caw:zeropos:toggle)

" ale設定

" 左端のカラムを常に表示
let g:ale_sign_column_always = 1
" 保存時のみ実行する
let g:ale_lint_on_text_changed = 0
" ファイルを開いたときにlint実行
let g:ale_lint_on_enter = 1
" Space + kで次の指摘へ、Space + jで前の指摘へ移動
nmap <Leader>k <Plug>(ale_previous_wrap)
nmap <Leader>j <Plug>(ale_next_wrap)

" 日本語入力エイリアス
nnoremap っd dd
nnoremap っy yy
nnoremap あ a
nnoremap い i
nnoremap う u

" vim-cheatsheet
let g:cheatsheet#cheat_file = '~/.config/nvim/cheatsheet.md'

" NERDTree設定
nmap <Leader>n :NERDTreeToggle<CR>
