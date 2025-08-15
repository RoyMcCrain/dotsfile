local M = {}

function M.setup()
  -- Set custom highlight colors
  require('plugins.render-markdown-highlights').setup()

  require('render-markdown').setup({
    enabled = true,
    max_file_size = 10.0,
    debounce = 100,
    render_modes = { 'n', 'c' },
    anti_conceal = {
      enabled = true,
    },
    heading = {
      enabled = true,
      sign = true,
      position = 'overlay',
      icons = { '◉ ', '○ ', '✸ ', '✿ ', '◆ ', '▪' },
      signs = { '󰫎 ' },
      width = 'full',
      backgrounds = {
        'RenderMarkdownH1Bg',
        'RenderMarkdownH2Bg',
        'RenderMarkdownH3Bg',
        'RenderMarkdownH4Bg',
        'RenderMarkdownH5Bg',
        'RenderMarkdownH6Bg',
      },
      foregrounds = {
        'RenderMarkdownH1',
        'RenderMarkdownH2',
        'RenderMarkdownH3',
        'RenderMarkdownH4',
        'RenderMarkdownH5',
        'RenderMarkdownH6',
      },
    },
    code = {
      enabled = true,
      sign = true,
      style = 'full',
      position = 'left',
      width = 'full',
      border = 'thin',
      highlight = 'RenderMarkdownCode',
      highlight_inline = 'RenderMarkdownCodeInline',
    },
    dash = {
      enabled = true,
      icon = '─',
      width = 'full',
    },
    bullet = {
      enabled = true,
      icons = { '●', '○', '◆', '◇' },
    },
    checkbox = {
      enabled = true,
      unchecked = {
        icon = '󰄱 ',
        highlight = 'RenderMarkdownUnchecked',
      },
      checked = {
        icon = '󰱒 ',
        highlight = 'RenderMarkdownChecked',
      },
      custom = {
        todo = { raw = '[-]', rendered = '󰥔 ', highlight = 'RenderMarkdownTodo' },
      },
    },
    quote = {
      enabled = true,
      icon = '▋',
    },
    -- Table rendering with built-in preset
    pipe_table = {
      enabled = true,
      preset = 'round', -- Use built-in preset: 'none', 'round', or 'double'
      style = 'full',
      cell = 'padded',
      min_width = 0,
      alignment_indicator = '━',
      head = 'RenderMarkdownTableHead',
      row = 'RenderMarkdownTableRow',
      filler = 'RenderMarkdownTableFill',
    },
    callout = {
      note = { raw = '[!NOTE]', rendered = '󰋽 Note', highlight = 'RenderMarkdownInfo' },
      tip = { raw = '[!TIP]', rendered = '󰌶 Tip', highlight = 'RenderMarkdownSuccess' },
      important = { raw = '[!IMPORTANT]', rendered = '󰅾 Important', highlight = 'RenderMarkdownHint' },
      warning = { raw = '[!WARNING]', rendered = '󰀪 Warning', highlight = 'RenderMarkdownWarn' },
      caution = { raw = '[!CAUTION]', rendered = '󰳦 Caution', highlight = 'RenderMarkdownError' },
    },
    link = {
      enabled = true,
      image = '󰥶 ',
      email = '󰊷 ',
      hyperlink = '󰌹 ',
      highlight = 'RenderMarkdownLink',
      custom = {
        web = { pattern = '^https?://', icon = '󰖟 ' },
      },
    },
    sign = {
      enabled = true,
      highlight = 'RenderMarkdownSign',
    },
    indent = {
      enabled = false,
    },
    win_options = {
      conceallevel = {
        default = vim.api.nvim_get_option_value('conceallevel', {}),
        rendered = 3,
      },
      concealcursor = {
        default = vim.api.nvim_get_option_value('concealcursor', {}),
        rendered = '',
      },
    },
  })
end

return M
