local M = {}

function M.setup()
  -- プラグインが読み込まれていない場合は終了
  local ok, neotest = pcall(require, "neotest")
  if not ok then
    vim.notify("Neotest not found", vim.log.levels.ERROR)
    return
  end
  
  neotest.setup({
    adapters = {
      require("neotest-go")({
        experimental = {
          test_table = true,
        },
        args = { "-count=1", "-timeout=60s" }
      }),
      require("neotest-vitest")({
        filter_dir = function(name, rel_path, root)
          return name ~= "node_modules"
        end,
      }),
      require("neotest-playwright").adapter({
        options = {
          persist_project_selection = true,
          enable_dynamic_test_discovery = true,
        }
      }),
    },
    discovery = {
      enabled = false,
    },
    diagnostic = {
      enabled = true,
      severity = 1,
    },
    floating = {
      border = "rounded",
      max_height = 0.6,
      max_width = 0.6,
      options = {}
    },
    highlights = {
      adapter_name = "NeotestAdapterName",
      border = "NeotestBorder",
      dir = "NeotestDir",
      expand_marker = "NeotestExpandMarker",
      failed = "NeotestFailed",
      file = "NeotestFile",
      focused = "NeotestFocused",
      indent = "NeotestIndent",
      marked = "NeotestMarked",
      namespace = "NeotestNamespace",
      passed = "NeotestPassed",
      running = "NeotestRunning",
      select_win = "NeotestWinSelect",
      skipped = "NeotestSkipped",
      target = "NeotestTarget",
      test = "NeotestTest",
      unknown = "NeotestUnknown",
      watching = "NeotestWatching",
    },
    icons = {
      child_indent = "│",
      child_prefix = "├",
      collapsed = "─",
      expanded = "╮",
      failed = "✖",
      final_child_indent = " ",
      final_child_prefix = "╰",
      non_collapsible = "─",
      passed = "✔",
      running = "🗘",
      running_animated = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" },
      skipped = "ｓ",
      unknown = "?",
      watching = "👁",
    },
    output = {
      enabled = true,
      open_on_run = true,
    },
    output_panel = {
      enabled = true,
      open = "botright split | resize 15"
    },
    quickfix = {
      enabled = true,
      open = false,
    },
    run = {
      enabled = true,
    },
    running = {
      concurrent = true,
    },
    state = {
      enabled = true,
    },
    status = {
      enabled = true,
      signs = true,
      virtual_text = false,
    },
    strategies = {
      integrated = {
        height = 40,
        width = 120,
      },
    },
    summary = {
      animated = true,
      enabled = true,
      expand_errors = true,
      follow = true,
      mappings = {
        attach = "a",
        clear_marked = "M",
        clear_target = "T",
        debug = "d",
        debug_marked = "D",
        expand = { "<CR>", "<2-LeftMouse>" },
        expand_all = "e",
        jumpto = "i",
        mark = "m",
        next_failed = "J",
        output = "o",
        prev_failed = "K",
        run = "r",
        run_marked = "R",
        short = "O",
        stop = "u",
        target = "t",
        watch = "w",
      },
      open = "botright vsplit | vertical resize 50",
    },
    watch = {
      enabled = true,
      symbol_queries = {
        go =
        "        ;query\n        ;Captures imported types\n        (qualified_type name: (type_identifier) @symbol)\n        ;Captures package-local and built-in types\n        (type_identifier)@symbol\n        ;Captures imported function calls and variables/constants\n        (selector_expression field: (field_identifier) @symbol)\n        ;Captures package-local functions calls\n        (call_expression function: (identifier) @symbol)\n      ",
        lua =
        '        ;query\n        ;Captures module names in require calls\n        (function_call\n          name: ((identifier) @function (#eq? @function "require"))\n          arguments: (arguments (string) @symbol))\n      ',
        python =
        "        ;query\n        ;Captures imports and modules they're imported from\n        (import_from_statement (_ (identifier) @symbol))\n        (import_statement (_ (identifier) @symbol))\n      ",
      },
    },
  })

  -- キーマッピング
  vim.keymap.set("n", "<leader>tt", function() require("neotest").run.run() end, { desc = "Run nearest test" })
  vim.keymap.set("n", "<leader>tf", function() require("neotest").run.run(vim.fn.expand("%")) end,
    { desc = "Run file tests" })
  vim.keymap.set("n", "<leader>td", function() require("neotest").run.run({ strategy = "dap" }) end,
    { desc = "Debug nearest test" })
  vim.keymap.set("n", "<leader>ts", function() require("neotest").run.stop() end, { desc = "Stop test" })
  vim.keymap.set("n", "<leader>ta", function() require("neotest").run.attach() end, { desc = "Attach to test" })
  vim.keymap.set("n", "<leader>to", function() require("neotest").output.open({ enter = true }) end,
    { desc = "Open test output" })
  vim.keymap.set("n", "<leader>tO", function() require("neotest").output_panel.toggle() end,
    { desc = "Toggle output panel" })
  vim.keymap.set("n", "<leader>tS", function() require("neotest").summary.toggle() end, { desc = "Toggle summary" })
  vim.keymap.set("n", "[t", function() require("neotest").jump.prev({ status = "failed" }) end,
    { desc = "Jump to previous failed test" })
  vim.keymap.set("n", "]t", function() require("neotest").jump.next({ status = "failed" }) end,
    { desc = "Jump to next failed test" })
  vim.keymap.set("n", "<leader>tw", function() require("neotest").watch.toggle(vim.fn.expand("%")) end,
    { desc = "Toggle watch mode" })

  -- コマンド定義
  vim.api.nvim_create_user_command('NeotestRun', function(opts)
    if opts.args == '' then
      require('neotest').run.run()
    elseif opts.args == 'file' then
      require('neotest').run.run(vim.fn.expand('%'))
    elseif opts.args == 'all' then
      require('neotest').run.run(vim.fn.getcwd())
    end
  end, {
    nargs = '?',
    complete = function()
      return { 'file', 'all' }
    end,
    desc = 'Run tests (nearest/file/all)'
  })

  vim.api.nvim_create_user_command('NeotestStop', function()
    require('neotest').run.stop()
  end, { desc = 'Stop running tests' })

  vim.api.nvim_create_user_command('NeotestSummary', function()
    require('neotest').summary.toggle()
  end, { desc = 'Toggle test summary' })

  vim.api.nvim_create_user_command('NeotestOutput', function(opts)
    local enter = opts.bang
    require('neotest').output.open({ enter = enter })
  end, { bang = true, desc = 'Open test output (use ! to enter window)' })

  vim.api.nvim_create_user_command('NeotestWatch', function(opts)
    if opts.args == '' then
      require('neotest').watch.toggle(vim.fn.expand('%'))
    elseif opts.args == 'stop' then
      require('neotest').watch.stop()
    end
  end, {
    nargs = '?',
    complete = function()
      return { 'stop' }
    end,
    desc = 'Toggle watch mode for current file'
  })
end

return M
