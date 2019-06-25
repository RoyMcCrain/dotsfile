nnoremap [denite] <Nop>
nmap <Leader>f [denite]
nnoremap <silent> [denite]f :<C-u>Denite file/rec<CR>
nnoremap <silent> [denite]g :<C-u>Denite grep<CR>
nnoremap <silent> [denite]c :<C-u>DeniteCursorWord grep<CR>
nnoremap <silent> [denite]u :<C-u>Denite file_mru<CR>
nnoremap <silent> [denite]y :<C-u>Denite neoyank<CR>
nnoremap <silent> [denite]r :<C-u>Denite -resume<CR>
nnoremap <silent> [denite]m :<C-u>Denite menu<CR>

nnoremap [Rails] <Nop>
nmap     <Leader>r [Rails]
nnoremap [Rails]r :Denite<Space>rails:
nnoremap <silent> [Rails]m :<C-u>Denite<Space>rails:model<Return>
nnoremap <silent> [Rails]c :<C-u>Denite<Space>rails:controller<Return>
nnoremap <silent> [Rails]v :<C-u>Denite<Space>rails:view<Return>
nnoremap <silent> [Rails]h :<C-u>Denite<Space>rails:helper<Return>
nnoremap <silent> [Rails]t :<C-u>Denite<Space>rails:test<Return>
nnoremap <silent> [Rails]s :<C-u>Denite<Space>rails:spec<Return>


let s:menus = {}

let s:menus.dein = { 'description': '⚔️  Plugin management' }
let s:menus.dein.command_candidates = [
  \   ['🐬 Dein: Plugins update 🔸', 'call dein#update()'],
  \   ['🐬 Dein: Plugins List   🔸', 'Denite dein'],
  \   ['🐬 Dein: Update log     🔸', 'echo dein#get_updates_log()'],
  \   ['🐬 Dein: Log            🔸', 'echo dein#get_log()'],
  \ ]

let s:menus.files = { 'description': '📁 File tools' }
let s:menus.files.command_candidates = [
  \   ['📂 Denite: Find in files…    🔹 ',  'Denite grep:.'],
  \   ['📂 Denite: Find files        🔹 ',  'Denite file/rec'],
  \   ['📂 Denite: Buffers           🔹 ',  'Denite buffer'],
  \   ['📂 Denite: MRU               🔹 ',  'Denite file/old'],
  \   ['📂 Denite: Line              🔹 ',  'Denite line'],
  \ ]

let s:menus.tools = { 'description': '⚙️  Dev Tools' }
let s:menus.tools.command_candidates = [
  \   ['🐠 Git commands       🔹', 'Git'],
  \   ['🐠 Git log            🔹', 'Denite gitlog:all'],
  \   ['🐠 Goyo               🔹', 'Goyo'],
  \   ['🐠 Tagbar             🔹', 'TagbarToggle'],
  \   ['🐠 File explorer      🔹', 'Defx -resume -toggle -buffer-name=tab`tabpagenr()`<CR>'],
  \ ]

let s:menus.config = { 'description': '🔧 Zsh Tmux Configuration' }
let s:menus.config.file_candidates = [
  \   ['🐠 Neovim Configurationfile            🔸', '~/dotsfile/nvim/init.vim'],
  \   ['🐠 Zsh Configurationfile            🔸', '~/dotsfile/zshrc'],
  \   ['🐠 Tmux Configurationfile           🔸', '~/dotsfile/tmux.conf'],
  \ ]

call denite#custom#var('menu', 'menus', s:menus)


" denite/insert モードのときは，C- で移動できるようにする
call denite#custom#map('insert', "<C-j>", '<denite:move_to_next_line>')
call denite#custom#map('insert', "<C-k>", '<denite:move_to_previous_line>')

" tabopen や vsplit のキーバインドを割り当て
call denite#custom#map('insert', "<C-v>", '<denite:do_action:vsplit>')
call denite#custom#map('normal', "v", '<denite:do_action:vsplit>')
" Change default prompt
call denite#custom#option('default', 'prompt', 'λ')
call denite#custom#var('menu', 'menus', s:menus)

" Change denite default options
call denite#custom#option('default', {
    \ 'split': 'floating'
    \ })

" Define mappings
autocmd FileType denite call s:denite_my_settings()
function! s:denite_my_settings() abort
  nnoremap <silent><buffer><expr> <CR>
  \ denite#do_map('do_action')
  nnoremap <silent><buffer><expr> d
  \ denite#do_map('do_action', 'delete')
  nnoremap <silent><buffer><expr> p
  \ denite#do_map('do_action', 'preview')
  nnoremap <silent><buffer><expr> q
  \ denite#do_map('quit')
  nnoremap <silent><buffer><expr> i
  \ denite#do_map('open_filter_buffer')
  nnoremap <silent><buffer><expr> <Space>
  \ denite#do_map('toggle_select').'j'
endfunction

autocmd FileType denite-filter call s:denite_filter_my_settings()
function! s:denite_filter_my_settings() abort
  imap <silent><buffer> <C-o> <Plug>(denite_filter_quit)
endfunction

" Ripgrep command on grep source
call denite#custom#var('grep', 'command', ['rg'])
call denite#custom#var('grep', 'default_opts',
		\ ['-i', '--vimgrep', '--no-heading'])
call denite#custom#var('grep', 'recursive_opts', [])
call denite#custom#var('grep', 'pattern_opt', ['--regexp'])
call denite#custom#var('grep', 'separator', ['--'])
call denite#custom#var('grep', 'final_opts', [])


" Define alias
call denite#custom#alias('source', 'file/rec/git', 'file/rec')
call denite#custom#var('file/rec/git', 'command',
      \ ['git', 'ls-files', '-co', '--exclude-standard'])

call denite#custom#alias('source', 'file/rec/py', 'file/rec')
call denite#custom#var('file/rec/py', 'command',['scantree.py'])

" Change ignore_globs
call denite#custom#filter('matcher/ignore_globs', 'ignore_globs',
      \ [ '.git/', '.ropeproject/', '__pycache__/',
      \   'venv/', 'images/', '*.min.*', 'img/', 'fonts/'])
