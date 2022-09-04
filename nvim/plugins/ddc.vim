call ddc#custom#patch_global('sources', ['tabnine','vim-lsp','buffer'])
call ddc#custom#patch_global('sourceOptions', {
    \ 'vim-lsp': {
    \   'matchers': ['matcher_fuzzy'],
    \   'mark': 'LSP',
    \ },
    \ 'tabnine': {
    \   'mark': 'TabNine',
    \   'isVolatile': v:true,
    \   'maxCandidates': 2,
    \ },
    \ 'buffer': {'mark': 'b'},
    \ '_': {
    \   'matchers': ['matcher_fuzzy'],
    \   'sorters': ['sorter_rank'],
    \   'converters': ['converter_remove_overlap'],
    \ },
    \ })

call ddc#custom#patch_global('sourceParams', {
    \ 'tabnine': {'maxNumResult': 2},
    \ 'buffer': {
    \   'requireSameFiletype': v:false,
    \   'limitBytes': 5000000,
    \   'fromAltBuf': v:true,
    \   'forceCollect': v:true,
    \ },
    \ })
call ddc#custom#patch_global('filterParams', {
    \ 'matcher_fuzzy': {'camelcase': v:true},
    \ })

call ddc#enable()
