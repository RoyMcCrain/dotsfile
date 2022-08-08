autocmd BufWritePre * LspDocumentFormatSync

nnoremap [LSP] <Nop>
nmap <silent><Leader>d [LSP]

nnoremap <silent> H <Cmd>LspHover<CR>

nnoremap <silent> [LSP]a <Cmd>LspCodeAction<CR>
nnoremap <silent> [LSP]D <Cmd>LspDefinition<CR>
nnoremap <silent> [LSP]d <Cmd>LspPeekDefinition<CR>
nnoremap <silent> [LSP]T <Cmd>LspTypeDefinition<CR>
nnoremap <silent> [LSP]t <Cmd>LspPeekTypeDefinition<CR>
nnoremap <silent> [LSP]r <Cmd>LspReferences<CR>
nnoremap <silent> [LSP]R <Cmd>LspRename<CR>
nnoremap <silent> [LSP]w <Cmd>LspWorkspaceSymbol<CR>
nnoremap <silent> [LSP]I <Cmd>LspImplementation<CR>
nnoremap <silent> [LSP]i <Cmd>LspPeekImplementation<CR>
nnoremap <silent> [LSP]s <Cmd>LspStatus<CR>
nnoremap <silent> [LSP]e <Cmd>LspDocumentDiagnostics<CR>
