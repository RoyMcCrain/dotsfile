autocmd BufWritePre * LspDocumentFormatSync
let g:lsp_signs_hint = {'text': '!'}

nnoremap [LSP] <Nop>
nmap <Leader>e [LSP]

nnoremap <silent> H :<C-u>LspHover<CR>
nnoremap <silent> [LSP]a :<C-u>LspCodeAction<CR>
nnoremap <silent> [LSP]g :<C-u>LspPeekDeclaration<CR>
nnoremap <silent> [LSP]d :<C-u>LspDefinition<CR>
nnoremap <silent> [LSP]r :<C-u>LspReferences<CR>
nnoremap <silent> [LSP]R :<C-u>LspRename<CR>
nnoremap <silent> [LSP]w :<C-u>LspWorkspaceSymbol<CR>
nnoremap <silent> [LSP]I :<C-u>LspImplementation<CR>
nnoremap <silent> [LSP]i :<C-u>LspPeekImplementation<CR>
nnoremap <silent> [LSP]s :<C-u>LspStatus<CR>
