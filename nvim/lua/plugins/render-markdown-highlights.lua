local M = {}

function M.setup()
  -- Set custom highlight colors for markdown headers
  vim.api.nvim_create_autocmd('ColorScheme', {
    pattern = '*',
    callback = function()
      -- H1: Blue/Cyan
      vim.api.nvim_set_hl(0, 'RenderMarkdownH1', { fg = '#89dceb', bold = true })
      vim.api.nvim_set_hl(0, 'RenderMarkdownH1Bg', { bg = '#313244' })

      -- H2: Green
      vim.api.nvim_set_hl(0, 'RenderMarkdownH2', { fg = '#a6e3a1', bold = true })
      vim.api.nvim_set_hl(0, 'RenderMarkdownH2Bg', { bg = '#313244' })

      -- H3: Yellow
      vim.api.nvim_set_hl(0, 'RenderMarkdownH3', { fg = '#f9e2af', bold = true })
      vim.api.nvim_set_hl(0, 'RenderMarkdownH3Bg', { bg = '#313244' })

      -- H4: Purple (instead of red)
      vim.api.nvim_set_hl(0, 'RenderMarkdownH4', { fg = '#cba6f7', bold = true })
      vim.api.nvim_set_hl(0, 'RenderMarkdownH4Bg', { bg = '#313244' })

      -- H5: Pink
      vim.api.nvim_set_hl(0, 'RenderMarkdownH5', { fg = '#f5c2e7', bold = true })
      vim.api.nvim_set_hl(0, 'RenderMarkdownH5Bg', { bg = '#313244' })

      -- H6: Orange
      vim.api.nvim_set_hl(0, 'RenderMarkdownH6', { fg = '#fab387', bold = true })
      vim.api.nvim_set_hl(0, 'RenderMarkdownH6Bg', { bg = '#313244' })
    end
  })

  -- Apply highlights immediately
  vim.cmd('doautocmd ColorScheme')
end

return M

