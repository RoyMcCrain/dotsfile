  inoremap <expr><silent><script> <C-k><C-k> copilot#Accept('<CR>')
  inoremap <C-k><C-n> <Plug>(copilot-next)
  inoremap <C-k><C-p> <Plug>(copilot-previous)
  inoremap <C-k><C-d> <Plug>(copilot-dismiss)
  inoremap <C-k><C-s> <Plug>(copilot-suggest)
  let g:copilot_no_tab_map = v:true
