let g:lightline = {
  \ 'colorscheme': 'material',
  \ 'component_function': {
  \   'filename': 'LightlineFilename',
  \   'gitbranch': 'fugitive#head'
  \ },
  \ 'component_expand': {
  \   'linter_checking': 'lightline#ale#checking',
  \   'linter_warnings': 'lightline#ale#warnings',
  \   'linter_errors': 'lightline#ale#errors',
  \   'linter_ok': 'lightline#ale#ok',
  \ },
  \ 'active': {
  \   'left': [
  \     [ 'mode', 'paste', 'gitbranch', 'readonly', 'modified' ],
  \     [ 'linter_checking', 'linter_errors', 'linter_warnings', 'linter_ok']
  \   ],
  \   'right': [
  \     [ 'filetype', 'fileformat', 'lineinfo' ],
  \     [ 'filename' ]
  \   ] 
  \ }
  \}
function! LightlineFilename()
  let root = fnamemodify(get(b:, 'git_dir'), ':h')
  let path = expand('%:p')
  if path[:len(root)-1] ==# root
    return path[len(root)+1:]
  endif
  return expand('%')
endfunction

set laststatus=2
set noshowmode
