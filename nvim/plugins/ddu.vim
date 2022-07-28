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
    \       'split': 'floating',
    \       'autoResize': v:true,
    \       'previewHeight': 50,
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
noremap <silent>ff <Cmd>call ddu#start({}) <CR>
noremap <silent>[ddu]g <Cmd>call ddu#start({
    \   'name': 'grep',
    \   'sources':[
    \     {'name': 'rg', 'params': {'input': expand('<cword>')}}
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

  nnoremap <buffer> <Esc>
    \ <Cmd><Cmd>call ddu#ui#ff#close()<CR>
endfunction
