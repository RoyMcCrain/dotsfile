nnoremap [Denite] <Nop>
nmap <Leader>h [Denite]
nnoremap <silent> [Denite]f :<C-u>Denite file/rec<CR>
nnoremap <silent> [Denite]g :<C-u>Denite grep<CR>
nnoremap <silent> [Denite]c :<C-u>DeniteCursorWord grep<CR>
nnoremap <silent> [Denite]u :<C-u>Denite file_mru<CR>
nnoremap <silent> [Denite]y :<C-u>Denite neoyank<CR>
nnoremap <silent> [Denite]r :<C-u>Denite -resume<CR>
nnoremap <silent> [Denite]m :<C-u>Denite menu<CR>

let s:menus = {}

let s:menus.Denite = { 'description': '📁 Denite Command' }
let s:menus.Denite.command_candidates = [
  \   [' Denite: "f" File検索                 ',  'Denite file/rec'],
  \   [' Denite: "g" Grep                     ',  'Denite grep'],
  \   [' Denite: "c" 選択した単語でGrep       ',  'DeniteCursorWord grep'],
  \   [' Denite: "u" MRU(最近開いたファイル)  ',  'Denite file_mru'],
  \   [' Denite: "y" NeoYank(yank一覧)        ',  'Denite neoyank'],
  \   [' Denite: "r" Deniteの履歴             ',  'Denite -resume'],
  \ ]


let s:menus.Dein = { 'description': '⚔️  Plugin management' }
let s:menus.Dein.command_candidates = [
  \   [' Dein: Plugins update ', 'call dein#update()'],
  \   [' Dein: Plugins List   ', 'Denite dein'],
  \   [' Dein: Update log     ', 'echo dein#get_updates_log()'],
  \   [' Dein: Log            ', 'echo dein#get_log()'],
  \ ]

let s:menus.Config = { 'description': '🔧 Configuration' }
let s:menus.Config.file_candidates = [
  \   [' Denite Configurationfile         ', '~/ghq/github.com/RoyMcCrain/dotsfile/nvim/plugins/denite.vim'],
  \   [' LSP Configurationfile            ', '~/ghq/github.com/RoyMcCrain/dotsfile/nvim/plugins/vim-lsp.vim'],
  \   [' Dein: toml                       ', '~/ghq/github.com/RoyMcCrain/dotsfile/nvim/toml/dein.toml'],
  \   [' Dein: toml lazy                  ', '~/ghq/github.com/RoyMcCrain/dotsfile/nvim/toml/dein_lazy.toml'],
  \   [' Neovim Configurationfile         ', '~/ghq/github.com/RoyMcCrain/dotsfile/nvim/init.vim'],
  \   [' Zsh Configurationfile            ', '~/ghq/github.com/RoyMcCrain/dotsfile/zshrc'],
  \ ]

call denite#custom#var('menu', 'menus', s:menus)

" Change denite default options
call denite#custom#option('default', {
  \ 'auto-resize': 'true',
  \ 'split': 'floating',
  \ 'prompt': '>',
  \ 'start-filter': 'true',
  \ 'smartcse': 'true',
 \ })

" Define mappings
autocmd FileType denite call s:denite_my_settings()
function! s:denite_my_settings() abort
  nnoremap <silent><buffer><expr> <CR>
  \ denite#do_map('do_action')
  nnoremap <silent><buffer><expr> D
  \ denite#do_map('do_action', 'delete')
  nnoremap <silent><buffer><expr> p
  \ denite#do_map('do_action', 'preview')
  nnoremap <silent><buffer><expr> <ESC><ESC>
  \ denite#do_map('quit')
  nnoremap <silent><buffer><expr> i
  \ denite#do_map('open_filter_buffer')
  nnoremap <silent><buffer><expr> <Space>
  \ denite#do_map('toggle_select').'j'
  nnoremap <silent><buffer><expr> d
  \ denite#do_map('move_up_path')
endfunction

autocmd FileType denite-filter call s:denite_filter_my_settings()
function! s:denite_filter_my_settings() abort
  inoremap <silent><buffer> <ESC><ESC> <Plug>(denite_filter_quit)
endfunction

" Ripgrep command on grep source
call denite#custom#var('grep', 'command', ['rg'])
call denite#custom#var('grep', 'default_opts',
  \ ['-i', '--vimgrep', '--no-heading'])
call denite#custom#var('grep', 'recursive_opts', [])
call denite#custom#var('grep', 'pattern_opt', ['--regexp'])
call denite#custom#var('grep', 'separator', ['--'])
call denite#custom#var('grep', 'final_opts', [])

call denite#custom#source('file/rec', 'matchers', ['matcher/clap'])

call denite#custom#var('file/rec', 'command',['rg', '--files', '--follow', '--vimgrep', '--no-heading'])

