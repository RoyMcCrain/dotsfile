function! CocCurrentFunction()
    return get(b:, 'coc_current_function', '')
  endfunction
let g:lightline = {
  \ 'colorscheme': 'one',
  \ 'component_function': {
  \   'filename': 'LightlineFilename',
  \   'gitbranch': 'fugitive#head',
  \   'cocstatus': 'coc#status',
  \   'currentfunction': 'CocCurrentFunction'
  \ },
  \ 'active': {
  \   'left': [
  \     [ 'mode', 'paste', 'gitbranch', 'readonly', 'modified' ],
  \     ['cocstatus'],
  \     ['currentfunction']
  \   ],
  \   'right': [
  \     ['filetype', 'fileformat', 'lineinfo' ],
  \     [ 'filename' ]
  \   ] 
  \ },
  \ 'separator': {
  \   'left': "\ue0b0"
  \  },
  \ 'subseparator': {
  \   'left': "\ue0b1",
  \   'right': "\ue0b3"
  \  },
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
