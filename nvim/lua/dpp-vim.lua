-- dpp.vim
local M = {}

M.setup = function()
  local CACHE = vim.fn.expand('$HOME/.cache')
  if type(CACHE) == 'string' and vim.fn.isdirectory(CACHE) == 0 then
    vim.fn.mkdir(CACHE, 'p')
  end
  -- Set dpp base path (required)
  local dpp_base = CACHE .. '/dpp'
  local config_dir = vim.fn.stdpath('config') .. '/dpp.config.ts'


  if not string.find(vim.o.runtimepath, '/dpp.vim') then
    local dpp_dir = dpp_base .. '/repos/github.com/Shougo/'
    if vim.fn.isdirectory(vim.fn.fnamemodify('dpp.vim', ':p')) == 0 then
      if vim.fn.isdirectory(dpp_dir) == 0 then
        vim.cmd('!git clone https://github.com/Shougo/dpp.vim' .. ' ' .. dpp_dir .. 'dpp.vim')
        vim.cmd('!git clone https://github.com/Shougo/dpp-ext-installer' .. ' ' .. dpp_dir .. 'dpp-ext-installer')
        vim.cmd('!git clone https://github.com/Shougo/dpp-ext-lazy' .. ' ' .. dpp_dir .. 'dpp-ext-lazy')
        vim.cmd('!git clone https://github.com/Shougo/dpp-ext-toml' .. ' ' .. dpp_dir .. 'dpp-ext-toml')
        vim.cmd('!git clone https://github.com/Shougo/dpp-protocol-git' .. ' ' .. dpp_dir .. 'dpp-protocol-git')
      end
    end
    vim.opt.runtimepath:prepend(dpp_dir .. 'dpp.vim')
    vim.opt.runtimepath:append(dpp_dir .. 'dpp-ext-installer')
    vim.opt.runtimepath:append(dpp_dir .. 'dpp-ext-lazy')
    vim.opt.runtimepath:append(dpp_dir .. 'dpp-ext-toml')
    vim.opt.runtimepath:append(dpp_dir .. 'dpp-protocol-git')
  end

  -- Load dpp state
  if vim.fn["dpp#min#load_state"](dpp_base) then
    if not string.find(vim.o.runtimepath, '/denops.vim') then
      local denops_src = dpp_base .. '/repos/github.com/vim-denops/denops.vim'
      if vim.fn.isdirectory(vim.fn.fnamemodify('denops.vim', ':p')) == 0 then
        if vim.fn.isdirectory(denops_src) == 0 then
          vim.cmd('!git clone https://github.com/vim-denops/denops.vim ' .. denops_src)
        end
      end
      vim.opt.runtimepath:prepend(denops_src)
    end

    vim.api.nvim_command('autocmd User DenopsReady call dpp#make_state("' .. dpp_base .. '", "' .. config_dir .. '")')
  end

  local dpp = require('dpp')

  vim.api.nvim_create_user_command('DppInstall', function()
    dpp.async_ext_action('installer', 'install')
  end, {})

  vim.api.nvim_create_user_command('DppUpdate', function()
    dpp.async_ext_action('installer', 'update')
  end, {})

  -- 状態のリフレッシュコマンド
  vim.api.nvim_create_user_command('DppRefresh', function()
    dpp.clear_state()
    dpp.make_state(dpp_base, config_dir)
    vim.notify('refresh')
  end, {})

  vim.api.nvim_create_user_command('DppClean', function()
    -- 使用されていないプラグインを取得
    local unused_plugins = dpp.check_clean()

    -- フィルタリングのための関数
    local function should_exclude(path)
      -- dpp-* プラグインや denops.vim を除外
      return string.match(path, '/dpp%-ext%-') or
          string.match(path, '/dpp%-protocol%-') or
          string.match(path, '/dpp%.vim$') or
          string.match(path, '/denops%.vim$')
    end

    -- 除外すべきでないプラグインだけをフィルタリング
    local filtered_plugins = {}
    for _, plugin in ipairs(unused_plugins) do
      if not should_exclude(plugin) then
        table.insert(filtered_plugins, plugin)
      end
    end

    if vim.tbl_isempty(filtered_plugins) then
      vim.notify('使用されていないプラグインはありません')
      return
    end

    -- 使用されていないプラグインを表示
    print('以下のプラグインが使用されていません:')
    for i, plugin in ipairs(filtered_plugins) do
      print(i .. ': ' .. plugin)
    end

    -- 削除確認
    local confirm = vim.fn.input('これらのプラグインを削除しますか？ (y/n): ')
    if confirm:lower() ~= 'y' then
      print('削除をキャンセルしました')
      return
    end

    -- プラグインの削除
    for _, plugin in ipairs(filtered_plugins) do
      vim.fn.delete(plugin, 'rf')
      print('削除しました: ' .. plugin)
    end

    -- 状態のリフレッシュ
    dpp.clear_state()
    dpp.make_state(dpp_base, config_dir)

    print('プラグイン状態を更新しました')
  end, {})
end

return M
