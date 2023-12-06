require("ddc_nvim_lsp_setup").setup()

vim.fn['ddc#custom#patch_global']('ui', 'native')
vim.fn['ddc#custom#patch_global']('sources', { 'nvim-lsp', 'buffer' })

vim.fn['ddc#custom#patch_global']('sourceOptions', {
	['nvim-lsp'] = {
		matchers = { 'matcher_fuzzy' },
		mark = 'LSP',
		keywordPattern = '\\k*',
		sorters = { 'sorter_lsp-kind' },
	},
	buffer = { mark = 'b' },
	_ = {
		matchers = { 'matcher_fuzzy' },
		sorters = { 'sorter_rank' },
		converters = { 'converter_remove_overlap' },
	},
})

vim.fn['ddc#custom#patch_global']('sourceParams', {
	['nvim-lsp'] = {
		snippetEngine = vim.fn['denops#callback#register'](function(body)
			return vim.fn['vsnip#anonymous'](body)
		end),
		enableResolveItem = true,
		enableAdditionalTextEdit = true,
		confirmBehavior = 'replace'
	},
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
