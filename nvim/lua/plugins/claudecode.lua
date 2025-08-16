local M = {}

function M.setup()
  require("claudecode").setup({
    -- Claude Code CLI command (default: "claude")
    terminal_cmd = nil,

    -- Auto start Claude Code when opening Neovim
    auto_start = true,

    -- Log level (debug/info/warn/error)
    log_level = "info",

    -- Track visual selection automatically
    track_selection = true,

    -- Terminal configuration
    terminal = {
      split_side = "right",         -- Terminal position: left/right/up/down
      split_width_percentage = 0.4, -- Terminal width (30% of screen)
      provider = "auto",            -- Terminal provider: auto/snacks/vim
      auto_close = true,            -- Auto close terminal when done
    },
  })

  -- Keymappings
  local keymap = vim.keymap.set
  local opts = { noremap = true, silent = true }


  -- Claude Code commands
  keymap("n", "<C-g>", ":ClaudeCode<CR>", vim.tbl_extend("force", opts, { desc = "Toggle Claude Code" }))
  keymap("t", "<C-g>", "<C-\\><C-n>:ClaudeCode<CR>",
    vim.tbl_extend("force", opts, { desc = "Toggle Claude Code from terminal" }))

  -- Visual mode: Send selection to Claude
  keymap("v", "<C-g>", ":'<,'>ClaudeCodeSend<CR>", vim.tbl_extend("force", opts, { desc = "Send to Claude" }))

  -- Command alias for adding current file to context
  vim.api.nvim_create_user_command("ClaudeCodeAddFile", function()
    local file = vim.fn.expand("%:p")
    vim.cmd("ClaudeCodeAdd " .. file)
  end, { desc = "Add current file to Claude context" })
end

return M
