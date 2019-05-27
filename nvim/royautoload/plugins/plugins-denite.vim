" gtagsとdeniteの連携設定
nnoremap [gtags] <Nop>
nmap <Space>t [gtags]
nnoremap <silent> [gtags]d :<C-u>DeniteCursorWord -buffer-name=gtags_def -mode=normal gtags_def<CR>
nnoremap <silent> [gtags]r :<C-u>DeniteCursorWord -buffer-name=gtags_ref -mode=normal gtags_ref<CR>
nnoremap <silent> [gtags]c :<C-u>DeniteCursorWord -buffer-name=gtags_context -mode=normal gtags_context<CR>


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


" Add custom menus
let s:menus = {}

let s:menus.commands = {
  \ 'description': 'コマンド'
  \ }
let s:menus.commands.command_candidates = [
  \ ['Cheat Sheet', 'Cheat'],
  \ ['Gbrowse', 'Gbrowse'],
  \ ['Ctag Init', 'GenCtags'],
  \ ['Gtag Init', 'GenGTAGS']
  \ ]
let s:menus.config = {
  \ 'description': 'コンフィグ'
  \ }
let s:menus.config.file_candidates = [
  \ ['coc', '~/dotsfile/nvim/royautoload/plugins/plugins-coc.vim'],
  \ ['dein.toml', '~/dotsfile/nvim/toml/dein.toml'],
  \ ['dein_lazy.toml', '~/dotsfile/nvim/toml/dein_lazy.toml'],
  \ ['init.vim', '~/dotsfile/nvim/init.vim'],
  \ ['defx', '~/dotsfile/nvim/royautoload/plugins/plugins-defx.vim'],
  \ ['denite', '~/dotsfile/nvim/royautoload/plugins/plugins-denite.vim'],
  \ ['lightline', '~/dotsfile/nvim/royautoload/plugins/plugins-lightline.vim'],
  \ ['vim-fugitive', '~/dotsfile/nvim/royautoload/plugins/plugins-vim-fugitive.vim'],
  \ ['zshrc', '~/dotsfile/zshrc'],
  \ ]

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
