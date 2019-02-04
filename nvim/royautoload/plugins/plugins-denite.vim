call denite#custom#var('file/rec', 'command',
	\ ['rg', '--files', '--glob', '!.git'])
call denite#custom#var('grep', 'command', ['rg'])
call denite#custom#var('grep', 'default_opts',
    \ ['--vimgrep', '--no-heading'])
call denite#custom#var('grep', 'recursive_opts', [])
call denite#custom#var('grep', 'pattern_opt', ['--regexp'])
call denite#custom#var('grep', 'separator', ['--'])
call denite#custom#var('grep', 'final_opts', [])

" 高速マッチャcpsm使用
call denite#custom#source('file/rec', 'matchers', ['matcher/cpsm','matcher/ignore_globs'])
" ignore_globsを上書きして検索除外を指定
call denite#custom#filter('matcher_ignore_globs', 'ignore_globs',
      \ [ '*~', '*.o', '*.exe', '*.bak',
      \ '.DS_Store', '*.pyc', '*.sw[po]', '*.class',
      \ '.hg/', '.git/', '.bzr/', '.svn/',
      \ 'node_modules/', 'bower_components/', 'tmp/', 'log/', 'vendor/ruby',
      \ '.idea/', 'dist/',
      \ 'tags', 'tags-*',
      \ 'GTAGS', 'GRTAGS', 'GPATH'])

" gtagsとdeniteの連携設定
nnoremap [gtags] <Nop>
nmap <Space>t [gtags]
nnoremap <silent> [gtags]d :<C-u>DeniteCursorWord -buffer-name=gtags_def -mode=normal gtags_def<CR>
nnoremap <silent> [gtags]r :<C-u>DeniteCursorWord -buffer-name=gtags_ref -mode=normal gtags_ref<CR>
nnoremap <silent> [gtags]c :<C-u>DeniteCursorWord -buffer-name=gtags_context -mode=normal gtags_context<CR>


" denite/insert モードのときは，C- で移動できるようにする
call denite#custom#map('insert', "<C-j>", '<denite:move_to_next_line>')
call denite#custom#map('insert', "<C-k>", '<denite:move_to_previous_line>')

" tabopen や vsplit のキーバインドを割り当て
call denite#custom#map('insert', "<C-v>", '<denite:do_action:vsplit>')
call denite#custom#map('normal', "v", '<denite:do_action:vsplit>')

nnoremap [denite] <Nop>
nmap <Leader>f [denite]
nnoremap <silent> [denite]f :<C-u>Denite file/rec<CR>
nnoremap <silent> [denite]g :<C-u>Denite grep<CR>
nnoremap <silent> [denite]c :<C-u>DeniteCursorWord grep<CR>
nnoremap <silent> [denite]u :<C-u>Denite file_mru<CR>
nnoremap <silent> [denite]y :<C-u>Denite neoyank<CR>
nnoremap <silent> [denite]r :<C-u>Denite -resume<CR>
nnoremap <silent> [denite]m :<C-u>Denite menu<CR>

nnoremap [rails] <Nop>
nmap     <Leader>r [rails]
nnoremap [rails]r :Denite<Space>rails:
nnoremap <silent> [rails]m :<C-u>Denite<Space>rails:model<Return>
nnoremap <silent> [rails]c :<C-u>Denite<Space>rails:controller<Return>
nnoremap <silent> [rails]v :<C-u>Denite<Space>rails:view<Return>
nnoremap <silent> [rails]h :<C-u>Denite<Space>rails:helper<Return>
nnoremap <silent> [rails]t :<C-u>Denite<Space>rails:test<Return>
nnoremap <silent> [rails]s :<C-u>Denite<Space>rails:spec<Return>

" Change default prompt
call denite#custom#option('default', 'prompt', 'λ')

" Add custom menus
let s:menus = {}

let s:menus.commands = {
  \ 'description': 'コマンド'
  \ }
let s:menus.commands.command_candidates = [
  \ ['Cheat Sheet', 'Cheat'],
  \ ['Gbrowse', 'Gbrowse'],
  \ ['Ctag Init', 'GenCtags'],
  \ ['Gtag Init', 'GenGTAGS'],
  \ ]
let s:menus.commands.file_candidates = [
  \ ['Edit Cheat Sheet', '~/dotsfile/nvim/cheatsheet.md'],
  \ ]

let s:menus.config = {
  \ 'description': 'いろんな Config'
  \ }
let s:menus.config.file_candidates = [
  \ ['init.vim', '~/dotsfile/nvim/init.vim'],
  \ ['dein.toml', '~/dotsfile/nvim/toml/dein.toml'],
  \ ['dein_lazy.toml', '~/dotsfile/nvim/toml/dein_lazy.toml'],
  \ ['defx', '~/dotsfile/nvim/royautoload/plugins/plugins-defx.vim'],
  \ ['denite', '~/dotsfile/nvim/royautoload/plugins/plugins-denite.vim'],
  \ ['lightline', '~/dotsfile/nvim/royautoload/plugins/plugins-lightline.vim'],
  \ ['vim-fugitive', '~/dotsfile/nvim/royautoload/plugins/plugins-vim-fugitive.vim'],
  \ ['zshrc', '~/dotsfile/zshrc'],
  \ ]


call denite#custom#var('menu', 'menus', s:menus)
