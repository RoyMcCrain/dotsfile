call ddc#custom#patch_global('ui', 'native')
call ddc#custom#patch_global('sources', ['vim-lsp','buffer'])
call ddc#custom#patch_global('sourceOptions', #{
    \ vim-lsp: #{
    \   matchers: ['matcher_fuzzy'],
    \   mark: 'LSP',
    \ },
    \ buffer: #{mark: 'b'},
    \ _: #{
    \   matchers: ['matcher_fuzzy'],
    \   sorters: ['sorter_rank'],
    \   converters: ['converter_remove_overlap'],
    \ },
    \ })

call ddc#custom#patch_global('sourceParams', #{
    \ buffer: #{
    \   requireSameFiletype: v:false,
    \   limitBytes: 5000000,
    \   fromAltBuf: v:true,
    \   forceCollect: v:true,
    \ },
    \ })
call ddc#custom#patch_global('filterParams', #{
    \ matcher_fuzzy: #{camelcase: v:true},
    \ })

call ddc#enable()
