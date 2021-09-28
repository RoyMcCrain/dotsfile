call ddc#custom#patch_global('sources', [ 'tabnine','vim-lsp','buffer'])
call ddc#custom#patch_global('sourceOptions', {
    \ 'vim-lsp': {
    \   'mark': 'LSP',
    \ },
    \ 'tabnine': {
    \   'mark': 'TabNine',
    \   'isVolatile': v:true,
    \   'maxCandidates': 2,
    \ },
    \ 'buffer': {'mark': 'buffer'},
    \ '_': {
    \   'matchers': ['matcher_fuzzy'],
    \   'sorters': ['sorter_rank'],
    \   'converters': ['converter_remove_overlap'],
    \ },
    \ })

call ddc#custom#patch_global('sourceParams', {
    \ 'tabnine': {'maxNumResult': 2},
    \ 'buffer': {'requireSameFiletype': v:false},
    \ })
call ddc#custom#patch_global('filterParams', {
    \ 'matcher_fuzzy': {'camelcase': v:true},
    \ })

call ddc#enable()
