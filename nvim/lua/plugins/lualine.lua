local M = {}

M.setup = function()
  -- 総行数を表示するカスタム関数
  local function line_count()
    return tostring(vim.api.nvim_buf_line_count(0)) .. "L"
  end
  -- 文字数を表示するカスタム関数
  local function char_count()
    local wc = vim.fn.wordcount()
    local mode = vim.fn.mode(true)

    -- ビジュアルモードでの選択範囲の文字数
    if mode:match('^[vV\22]') then
      if wc.visual_chars then -- Neovim 0.7+
        return wc.visual_chars .. "文字"
      end
    else
      return ""
    end
  end

  require('lualine').setup {
    options = {
      theme = 'material',
      globalstatus = true,
    },
    sections = {
      lualine_a = { 'mode' },
      lualine_b = {
        'paste',
        'branch',
        'readonly',
        'modified',
      },
      lualine_c = {
        { 'diff', colored = true },
        'diagnostics',
      },
      lualine_x = {
        char_count,
        'location',
        line_count,
        'fileformat',
        'filetype',
      },
      lualine_y = {
        {
          'lsp_status',
          ignore_lsp = { 'GitHub Copilot', 'biome' },
          fmt = function(str)
            return str:gsub('GitHub Copilot', 'Copilot')
                :gsub('lua_ls', 'lua')
                :gsub('ts_ls', 'ts')
                :gsub('tailwindcss', 'tw')
                :gsub('vimls', 'vim')
                :gsub('yamlls', 'yaml')
                :gsub('ruby_lsp', 'ruby')
                :gsub('pyright', 'python')
                :gsub('graphql', 'gql')
                :gsub('gopls', 'go')
                :gsub('rust_analyzer', 'rust')
                :gsub('stylelint_lsp', 'stylelint')
                :gsub('cssls', 'css')
                :gsub('denols', 'deno')
                :gsub('oxlint', 'oxl')
                :gsub('oxfmt', 'oxf')
          end,
        }
      },
      lualine_z = {},
    },
    tabline = {
      lualine_a = {},
      lualine_b = {
        { 'filename', path = 1 }
      },
      lualine_c = {},
      lualine_y = { 'tabs' },
      lualine_z = {},
    },
    winbar = {
      lualine_a = {},
      lualine_b = {},
      lualine_c = {
        { 'navic', color_correction = 'dynamic' }
      },
      lualine_x = {},
      lualine_y = {},
      lualine_z = {},
    },
  }
end

return M
