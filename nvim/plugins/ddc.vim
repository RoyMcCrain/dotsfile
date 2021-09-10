call ddc#custom#patch_global('sources', [ 'tabnine','ddc-vim-lsp','buffer'])
call ddc#custom#patch_global('sourceOptions', {
    \ 'ddc-vim-lsp': {
    \   'mark': 'LSP',
    \ },
    \ 'tabnine': {
    \   'mark': 'TabNine',
    \   'isVolatile': v:true,
    \   'maxNumResults': 2,
    \ },
    \ 'buffer': {'mark': 'buffer'},
    \ '_': {
    \   'matchers': ['matcher_fuzzy'],
    \   'sorters': ['sorter_rank'],
    \   'converters': ['converter_remove_overlap'],
    \ },
    \ })

call ddc#custom#patch_global('sourceParams', {
    \ 'buffer': {'requireSameFiletype': v:false},
    \ })
call ddc#custom#patch_global('filterParams', {
    \ 'matcher_fuzzy': {'camelcase': v:true},
    \ })

call ddc#enable()
