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
call denite#custom#filter('matcher/ignore_globs', 'ignore_globs',
  \ [
  \ '.git/', 'build/', '__pycache__/',
  \ 'images/', '*.o', '*.make',
  \ '*.min.*',
  \ 'img/', 'fonts/'])

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
nmap <Space>f [denite]
nnoremap <silent> [denite]f :<C-u>Denite file/rec<CR>
nnoremap <silent> / :<C-u>Denite -buffer-name=search -auto-resize line<CR>
nnoremap <silent> [denite]g :<C-u>Denite grep<CR>
nnoremap <silent> [denite]c :<C-u>DeniteCursorWord grep<CR>
nnoremap <silent> [denite]u :<C-u>Denite file/mru<CR>
nnoremap <silent> [denite]y :<C-u>Denite neoyank<CR>
nnoremap <silent> [denite]u :<C-u>Denite -resume<CR>
