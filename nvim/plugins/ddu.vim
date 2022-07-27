call ddu#custom#patch_global({
    \   'ui': 'filer',
    \   'sources': [{'name': 'file', 'params': {}}],
    \   'sourceOptions': {
    \     '_': {
    \       'columns': ['filename'],
    \     },
    \   },
    \   'kindOptions': {
    \     'file': {
    \       'defaultAction': 'open',
    \     },
    \   },
    \ })

noremap <silent><Leader>m :call ddu#start({}) <CR>
autocmd FileType ddu-filer call s:ddu_my_settings()
function! s:ddu_my_settings() abort
  nnoremap <buffer><expr> <CR>
        \ ddu#ui#filer#is_directory() ?
        \ "<Cmd>call ddu#ui#filer#do_action('expandItem',
        \  {'mode': 'toggle'})<CR>" :
        \ "<Cmd>call ddu#ui#filer#do_action('itemAction',
        \  {'name': 'open'})<CR>"
  nnoremap <buffer><silent> H
        \ <Cmd>call ddu#ui#filer#do_action('toggleSelectItem')<CR>
  nnoremap <buffer><silent> q
        \ <Cmd>call ddu#ui#filer#do_action('quit')<CR>
  nnoremap <buffer><silent> c
        \ <Cmd>call ddu#ui#filer#do_action('itemAction',
        \ {'name': 'copy'})<CR>
  nnoremap <buffer><silent> m
        \ <Cmd>call ddu#ui#filer#do_action('itemAction',
        \ {'name': 'move'})<CR>
  nnoremap <buffer><silent> p
        \ <Cmd>call ddu#ui#filer#do_action('itemAction',
        \ {'name': 'paste'})<CR>
  nnoremap <buffer><silent> K
        \ <Cmd>call ddu#ui#filer#do_action('itemAction',
        \ {'name': 'newDirectory'})<CR>
  nnoremap <buffer><silent> N
        \ <Cmd>call ddu#ui#filer#do_action('itemAction',
        \ {'name': 'newFile'})<CR>
  nnoremap <buffer><silent> r
        \ <Cmd>call ddu#ui#filer#do_action('itemAction',
        \ {'name': 'rename'})<CR>
  nnoremap <buffer><silent> yy
        \ <Cmd>call ddu#ui#filer#do_action('itemAction',
        \ {'name': 'yank'})<CR>
endfunction
