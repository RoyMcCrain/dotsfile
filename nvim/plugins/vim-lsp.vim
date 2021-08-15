" haskell 設定
let g:lsp_log_verbose = 0
let g:lsp_log_file = expand('~/vim-lsp.log')

if executable('haskell-language-server-wrapper')
    au User lsp_setup call lsp#register_server({
        \ 'name': 'hls',
        \ 'cmd': {server_info->['haskell-language-server-wrapper', '--lsp']},
        \ 'root_uri':{server_info->lsp#utils#path_to_uri(
        \     lsp#utils#find_nearest_parent_file_directory(
        \         lsp#utils#get_buffer_path(),
        \         ['.cabal', 'stack.yaml', 'cabal.project', 'package.yaml', 'hie.yaml', '.git'],
        \     ))},
        \ 'whitelist': ['haskell', 'lhaskell'],
        \ })
endif

autocmd BufWritePre * LspDocumentFormatSync
let g:lsp_signs_hint = {'text': '!'}

nnoremap [LSP] <Nop>
nmap <silent><Leader>d [LSP]

nnoremap <silent> H :<C-u>LspHover<CR>
nnoremap <silent> [LSP]a :<C-u>LspCodeAction<CR>
nnoremap <silent> [LSP]D :<C-u>LspDefinition<CR>
nnoremap <silent> [LSP]d :<C-u>LspPeekDefinition<CR>
nnoremap <silent> [LSP]T :<C-u>LspTypeDefinition<CR>
nnoremap <silent> [LSP]t :<C-u>LspPeekTypeDefinition<CR>
nnoremap <silent> [LSP]r :<C-u>LspReferences<CR>
nnoremap <silent> [LSP]R :<C-u>LspRename<CR>
nnoremap <silent> [LSP]w :<C-u>LspWorkspaceSymbol<CR>
nnoremap <silent> [LSP]I :<C-u>LspImplementation<CR>
nnoremap <silent> [LSP]i :<C-u>LspPeekImplementation<CR>
nnoremap <silent> [LSP]s :<C-u>LspStatus<CR>
nnoremap <silent> [LSP]e :<C-u>LspDocumentDiagnostics<CR>
