nnoremap <silent> <Leader>l <Cmd>Fern . -reveal=% <CR>

function! s:init_fern() abort
  nmap <buffer> V <Plug>(fern-action-open:vsplit)
  nmap <buffer> S <Plug>(fern-action-open:split)
endfunction

 augroup fern-custom
   autocmd! *
   autocmd FileType fern call s:init_fern()
 augroup END
