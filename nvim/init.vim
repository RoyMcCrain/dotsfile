"-------------------------------------------------------------------------------
" Vim Options
"-------------------------------------------------------------------------------

set signcolumn=yes                " 左端のリンターとか出すところを常に出す
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
if has("persistent_undo")
  set undodir=~/.config/nvim/undo " undoファイルのパス
  set undofile
endif
set noswapfile                    " swpファイルをつくらない
set termguicolors                 " trueカラーを使う
let $NVIM_TUI_ENABLE_TRUE_COLOR=1
set clipboard+=unnamedplus
let mapleader = "\<Space>"
set pumheight=5                    " 変換候補で表示される数
set nowrap                         " テキストが折り返されないようにする
set colorcolumn=120                " カラムにラインを引く
let g:netrw_home=$XDG_CACHE_HOME.'/nvim'
" View
set showmatch                       " 閉じ括弧が入力されたとき、対応する開き括弧にわずかの間ジャンプする
set matchtime=1                     " マッチしている括弧を表示するための時間を0.1秒単位で指定する
set number                          " 毎行の前に行番号を表示する
set list                            " 不可視文字を表示する
set listchars=trail:-,extends:»,precedes:«,nbsp:%,eol:⏎
set display=lastline                " テキスト表示の方法を変える(長いテキストを省略せず最後まで表示する)
set laststatus=2                    " 最下ウィンドウにステータス行を常に表示する
" Indent
set tabstop=2           " ファイル内の<Tab>が対応する空白の数
set softtabstop=2       " <Tab>キーを押した際に挿入されるスペース量
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
set inccommand=split              " 置き換え結果previewで見れる
" special
set gdefault                            " 置換のgオプションをデフォルトで有効にする
set wildmenu                            " Tabによる自動補完を有効にする
set wildmode=list:longest,full          " vimからファイルを開く時にtabを押すとリストを表示する
set virtualedit=block                   " 文字のない所にカーソル移動できる
" windows設定
set shellslash   "ディレクトリパスに/を使えるようにする
" エンコーディングの設定
set fileformats=unix,dos,mac
set maxfuncdepth=200
" neovim
tnoremap <silent> <C-[> <C-\><C-n>
" 行末までのヤンク
nnoremap Y y$
" <C-[>でterminalモードから抜ける
" esc escで検索のハイライトを消す
noremap <ESC><ESC> :noh<CR>
" 英語配列用
noremap; :
noremap: ;
vnoremap; :
vnoremap: ;
" 空の行を挿入
nnoremap O :<C-u>call append(expand('.'), '')<CR>j
" ヤンクの内容を消さない設定
noremap PP "0p
noremap x "_x

" 分割エイリアス
noremap <silent> vs :vsplit<CR>
noremap <silent> S :split<CR>
" window移動
noremap <C-d> <C-w>h
noremap <C-h> <C-w>j
noremap <C-t> <C-w>k
noremap <C-n> <C-w>l
" Folding
set foldmethod=syntax
set foldlevelstart=99
" neovim機能
set winhl=Normal:Floating
" githubのtokenを読み込む
source <sfile>:h/token.vim

" ctrl-spaceで日本語切り替えなのでvimの動作を止める
imap <C-space> <Nop>

set runtimepath+=$HOME/.cache/dein/repos/github.com/Shougo/dein.vim

" Required:
if dein#load_state('$HOME/.cache/dein')
  call dein#begin('$HOME/.cache/dein')

  " Let dein manage dein
  " Required:
  call dein#add('$HOME/.cache/dein/repos/github.com/Shougo/dein.vim')

  " 管理するプラグインを記述したファイル
  let s:toml = '$HOME/.config/nvim/toml/dein.toml'
  let s:lazy_toml = '$HOME/.config/nvim/toml/dein_lazy.toml'
  call dein#load_toml(s:toml, {'lazy': 0})
  call dein#load_toml(s:lazy_toml, {'lazy': 1})

  call dein#end()
  call dein#save_state()
  " vimrcやtomlを修正したら自動でアンスコする
  let g:dein#auto_recache = 1
endif

syntax enable
filetype plugin indent on
" let g:python3_host_prog='/usr/bin/python3'

" Golang
autocmd FileType go setlocal noexpandtab
autocmd FileType go setlocal tabstop=4
autocmd FileType go setlocal shiftwidth=4
