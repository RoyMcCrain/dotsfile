local M = {}

M.setup = function()
  require 'nvim-treesitter.configs'.setup({
    modules = {},
    sync_install = false,
    ignore_install = {},
    auto_install = true,
    ensure_installed = {
      "bash",
      "c",
      "c_sharp",
      "clojure",
      "cpp",
      "css",
      "dockerfile",
      "diff",
      "elixir",
      "elm",
      "erlang",
      "gitignore",
      "go",
      "gomod",
      "graphql",
      "haskell",
      "html",
      "http",
      "java",
      "javascript",
      "jq",
      "jsdoc",
      "json",
      "jsonc",
      "json5",
      "kotlin",
      "lua",
      "make",
      "markdown",
      "markdown_inline",
      "php",
      "python",
      "regex",
      "ruby",
      "rust",
      "scala",
      "scss",
      "svelte",
      "sql",
      "toml",
      "tsx",
      "twig",
      "typescript",
      "vim",
      "vimdoc",
      "vue",
      "yaml",
      "zig",
    },
    highlight = {
      enable = true,
    },
    indent = {
      enable = true,
    },
  })
end

return M
