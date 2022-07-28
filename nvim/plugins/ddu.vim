call ddu#custom#patch_global({
    \   'ui': 'ff',
    \   'sources': [
    \     {
    \       'name': 'file_rec',
    \       'params': {
    \         'ignoredDirectories': [
    \           '.git',
    \           'node_modules',
    \           'vendor',
    \           '.next',
    \         ]
    \       }
    \     }
    \   ],
    \   'sourceOptions': {
    \     '_': {
    \       'matchers': ['matcher_substring'],
    \       'columns': ['filename'],
    \     },
    \   },
    \   'filterParams': {
    \     'matcher_substring': {
    \       'highlightMatched': 'Title',
    \     },
    \   },
    \   'kindOptions': {
    \     'file': {
    \       'defaultAction': 'open',
    \     },
    \   },
    \   'uiParams': {
    \     'ff': {
    \       'startFilter': v:true,
    \       'prompt': 'λ ',
    \     },
    \     'filer': {
    \       'search': expand('%:p'),
    \     },
    \   },
    \ })

call ddu#custom#patch_local('grep', {
    \   'sourceParams' : {
    \     'rg' : {
    \       'args': ['--column', '--no-heading', '--color', 'never'],
    \     },
    \   },
    \   'uiParams': {
    \     'ff': {
    \       'startFilter': v:false,
    \     }
    \   },
    \ })

nnoremap [ddu]  <Nop>
nmap <space>t [ddu]
noremap <silent>F <Cmd>call ddu#start({}) <CR>
noremap <silent>[ddu]g <Cmd>call ddu#start({
    \   'name': 'grep',
    \   'sources':[
    \     {'name': 'rg', 'params': {'input': expand('<cword>')}}
    \   ],
    \ })<CR>

noremap <silent><Leader>m <Cmd>call ddu#start({
    \   'ui': 'filer',
    \   'sources': [
    \     {
    \       'name': 'file',
    \       'params': {},
    \     }
    \   ],
    \ })<CR>

autocmd FileType ddu-ff call s:ddu_my_ff_settings()
function! s:ddu_my_ff_settings() abort
  nnoremap <buffer><silent> <CR>
        \ <Cmd>call ddu#ui#ff#do_action('itemAction', {'name': 'open'})<CR>

  nnoremap <buffer><silent> v
    \ <Cmd>call ddu#ui#ff#do_action('itemAction', {'name': 'open', 'params': {'command': 'vsplit'}})<CR>

  nnoremap <buffer><silent> s
    \ <Cmd>call ddu#ui#ff#do_action('itemAction', {'name': 'open', 'params': {'command': 'split'}})<CR>

  nnoremap <buffer><silent> d
    \ <Cmd>call ddu#ui#ff#do_action('openFilterWindow')<CR>

  nnoremap <buffer><silent> p
    \ <Cmd>call ddu#ui#ff#do_action('preview')<CR>

  nnoremap <buffer><silent> <Esc>
    \ <Cmd>call ddu#ui#ff#do_action('quit')<CR>
endfunction

autocmd FileType ddu-ff-filter call s:ddu_filter_my_settings()
function! s:ddu_filter_my_settings() abort
  inoremap <buffer> <CR>
    \ <Esc><Cmd>call ddu#ui#ff#close()<CR>

  nnoremap <buffer> <CR>
    \ <Cmd><Cmd>call ddu#ui#ff#close()<CR>
endfunction

autocmd FileType ddu-filer call s:ddu_my_filer_settings()
function! s:ddu_my_filer_settings() abort
  nnoremap <buffer><expr> <CR>
        \ ddu#ui#filer#is_directory() ?
        \ "<Cmd>call ddu#ui#filer#do_action('expandItem',
        \  {'mode': 'toggle'})<CR>" :
        \ "<Cmd>call ddu#ui#filer#do_action('itemAction',
        \  {'name': 'open'})<CR>"

  nnoremap <buffer><silent> <Esc>
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

