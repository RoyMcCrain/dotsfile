vim.fn['ddc#custom#patch_global']('ui', 'native')
vim.fn['ddc#custom#patch_global']('sources', { 'nvim-lsp', 'buffer' })

vim.fn['ddc#custom#patch_global']('sourceOptions', {
	['nvim-lsp'] = {
		matchers = { 'matcher_fuzzy' },
		mark = 'LSP',
	},
	buffer = { mark = 'b' },
	_ = {
		matchers = { 'matcher_fuzzy' },
		sorters = { 'sorter_rank' },
		converters = { 'converter_remove_overlap' },
	},
})

vim.fn['ddc#custom#patch_global']('sourceParams', {
	buffer = {
		requireSameFiletype = false,
		limitBytes = 5000000,
		fromAltBuf = true,
		forceCollect = true,
	},
})

vim.fn['ddc#custom#patch_global']('filterParams', {
	matcher_fuzzy = { camelcase = true },
})

vim.fn['ddc#enable']()
