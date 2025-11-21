local M = {}

local util = require('lspconfig.util')
M.util = util

---@param fname string ファイルパス
---@param target_files string|string[] 検索対象のファイル名（単一の文字列または配列）
---@param fallback_patterns string[]|nil フォールバック用のパターン配列
---@return string|nil 見つかったディレクトリパスまたはnil
function M.find_nearest_file(fname, target_files, fallback_patterns)
  -- target_filesが文字列の場合は配列に変換
  if type(target_files) == 'string' then
    target_files = { target_files }
  end

  local current_dir = vim.fn.fnamemodify(fname, ':h')

  -- ディレクトリを上に辿りながら指定ファイルを探す
  while current_dir ~= '/' do
    for _, file in ipairs(target_files) do
      local file_path = current_dir .. "/" .. file
      if vim.fn.filereadable(file_path) == 1 then
        return current_dir
      end
    end
    -- 親ディレクトリに移動
    current_dir = vim.fn.fnamemodify(current_dir, ':h')
  end

  -- 見つからなければデフォルトのロジックを使用
  if not fallback_patterns then
    return nil
  end
  return util.root_pattern(unpack(fallback_patterns))(fname)
end

---@param fname string ファイルパス
---@param target_files string|string[] 検索対象のファイル名（単一の文字列または配列）
---@return boolean 指定されたファイルが見つかった場合はtrue、それ以外はfalse
function M.is_find_nearest_file(fname, target_files)
  -- target_filesが文字列の場合は配列に変換
  if type(target_files) == 'string' then
    target_files = { target_files }
  end

  local current_dir = vim.fn.fnamemodify(fname, ':h')

  -- ディレクトリを上に辿りながら指定ファイルを探す
  while current_dir ~= '/' do
    for _, file in ipairs(target_files) do
      local file_path = current_dir .. "/" .. file
      if vim.fn.filereadable(file_path) == 1 then
        return true
      end
    end
    -- 親ディレクトリに移動
    current_dir = vim.fn.fnamemodify(current_dir, ':h')
  end

  -- 見つからなかった場合
  return false
end

---ファイル保存時にフォーマット処理を実行する
---@return nil
function M.format_on_save()
  local filename = vim.fn.expand('%:t')
  if not string.find(filename, 'no_fmt') then
    local biome_active = false
    for _, client in ipairs(vim.lsp.get_active_clients({ bufnr = 0 })) do
      if client.name == 'biome' then
        biome_active = true
        break
      end
    end
    if biome_active then
      vim.lsp.buf.format({ name = 'biome' })
      return
    end
    vim.lsp.buf.format()
  end
end

---ファイル保存時にPrettierを実行する
---@return nil
function M.run_prettier()
  local filename = vim.fn.expand('%:t')
  if not string.find(filename, 'no_fmt') then
    vim.cmd("silent! Prettier")
  end
end

return M
