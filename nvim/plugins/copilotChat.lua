require("CopilotChat").setup {
	debug = true, -- Enable debugging
	window = {
		layout = 'float',
		width = 0.8,
		height = 0.8,
	},
	system_prompt = 'Your name is Github Copilot and you are a AI assistant for developers. All replies must be returned in Japanese.',
	prompts = {
		Explain = {
			prompt = '/COPILOT_EXPLAIN Write an explanation for the active selection as paragraphs of text. All replies must be returned in Japanese.',
		},
		Review = {
			prompt = '/COPILOT_REVIEW Review the selected code. All replies must be returned in Japanese.',
		},
		Fix = {
			prompt = '/COPILOT_GENERATE There is a problem in this code. Rewrite the code to show it with the bug fixed. All replies must be returned in Japanese.',
		},
		Optimize = {
			prompt = '/COPILOT_GENERATE Optimize the selected code to improve performance and readablilty. All replies must be returned in Japanese.',
		},
		Docs = {
			prompt = '/COPILOT_GENERATE Please add documentation comment for the selection. All replies must be returned in Japanese.',
		},
		Tests = {
			prompt = '/COPILOT_GENERATE Please generate tests for my code. All replies must be returned in Japanese.',
		},
		FixDiagnostic = {
			prompt = ' All replies must be returned in Japanese.Please assist with the following diagnostic issue in file:',
		},
		Commit = {
			prompt = ' Write commit message for the change with commitizen convention. Make sure the title has maximum 50 characters and message is wrapped at 72 characters. Wrap the whole message in code block with language gitcommit.',
		},
		CommitStaged = {
			prompt = 'Write commit message for the change with commitizen convention. Make sure the title has maximum 50 characters and message is wrapped at 72 characters. Wrap the whole message in code block with language gitcommit.',
		},
	},
}

vim.api.nvim_create_user_command("Chat", function()
	vim.cmd("CopilotChat")
end, {})

vim.api.nvim_create_user_command("Explain", function()
	vim.cmd("CopilotChatExplain")
end, {})

vim.api.nvim_create_user_command("Review", function()
	vim.cmd("CopilotChatReview")
end, {})

vim.api.nvim_create_user_command("Fix", function()
	vim.cmd("CopilotChatFix")
end, {})

vim.api.nvim_create_user_command("Optimize", function()
	vim.cmd("CopilotChatOptimize")
end, {})

vim.api.nvim_create_user_command("Tests", function()
	vim.cmd("CopilotChatTests")
end, {})
