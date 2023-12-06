vim.fn['ddc#custom#patch_global']('ui', 'pum')
vim.fn['ddc#custom#patch_global']('sources', { 'copilot', 'lsp', 'buffer' })

vim.fn['ddc#custom#patch_global']('sourceOptions', {
	copilot = {
		matchers = {},
		mark = 'CP',
		minAutoCompleteLength = 0,
		isVolatile = true,
	},
	lsp = {
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
	lsp = {
		enableResolveItem = true,
		enableAdditionalTextEdit = true,
		snippetEngine = '',
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

vim.api.nvim_set_keymap('i', '<C-n>', '<Cmd>call pum#map#insert_relative(+1)<CR>', {})
vim.api.nvim_set_keymap('i', '<C-p>', '<Cmd>call pum#map#insert_relative(-1)<CR>', {})
vim.api.nvim_set_keymap('i', '<C-k>', '<Cmd>call pum#map#confirm()<CR>', {})
vim.api.nvim_set_keymap('i', '<C-e>', '<Cmd>call pum#map#cancel()<CR>', {})
vim.api.nvim_set_keymap('i', '<PageDown>', '<Cmd>call pum#map#insert_relative(+1)<CR>', {})
vim.api.nvim_set_keymap('i', '<PageUp>', '<Cmd>call pum#map#insert_relative(-1)<CR>', {})
