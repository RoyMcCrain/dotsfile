inoremap <expr><silent><script> <C-t><C-t> copilot#Accept('<CR>')
inoremap <silent> <C-t><C-n> <Plug>(copilot-next)
inoremap <silent> <C-t><C-p> <Plug>(copilot-previous)
inoremap <silent> <C-t><C-d> <Plug>(copilot-dismiss)
inoremap <silent> <C-t>>C-s> <Plug>(copilot-suggest)
let g:copilot_no_tab_map = v:true
