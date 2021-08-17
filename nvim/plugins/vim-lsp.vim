autocmd BufWritePre * LspDocumentFormatSync

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
