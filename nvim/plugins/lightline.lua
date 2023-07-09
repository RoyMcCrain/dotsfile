vim.g.lightline = {
  colorscheme = 'material',
  component_function = {
    filename = 'LightlineFilename',
    gitbranch = 'FugitiveHead',
    lspstatus = 'lsp#get_server_status',
  },
  active = {
    left = {
      { 'mode', 'paste', 'gitbranch', 'readonly', 'modified' },
      { 'lspstatus' }
    },
    right = {
      { 'filetype', 'fileformat', 'lineinfo' },
      { 'filename' }
    }
  },
}

vim.api.nvim_exec([[
  function! LightlineFilename()
    let root = fnamemodify(get(b:, 'git_dir'), ':h')
    let path = expand('%:p')
    if path[:len(root)-1] ==# root
      return path[len(root)+1:]
    endif
    return expand('%')
  endfunction
]], false)

vim.opt.laststatus = 3