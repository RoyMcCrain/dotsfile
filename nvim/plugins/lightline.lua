vim.g.lightline = {
  colorscheme = 'material',
  component_function = {
    filename = 'LightlineFilename',
    gitbranch = 'FugitiveHead',
  },
  active = {
    left = {
      { 'mode', 'paste', 'gitbranch', 'readonly', 'modified' },
    },
    right = {
      { 'filetype', 'fileformat', 'lineinfo' },
      { 'filename' }
    }
  },
}


vim.cmd([[
  function! LightlineFilename()
    let root = fnamemodify(get(b:, 'git_dir'), ':h')
    let path = expand('%:p')
    if path[:len(root)-1] ==# root
      return path[len(root)+1:]
    endif
    return expand('%')
  endfunction
]])

vim.opt.laststatus = 3
