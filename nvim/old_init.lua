-- ファイル保存時にeslintによるフォーマットを実行する
vim.api.nvim_create_user_command('YarnLint', function()
  local file_path = vim.fn.expand('%:p')
  local cmd = 'yarn lint --fix ' .. vim.fn.shellescape(file_path)
  local output = vim.fn.system(cmd)
  local exit_code = vim.v.shell_error

  if exit_code == 0 then
    vim.cmd('e') -- ファイルを再読み込み
    print("eslintによるフォーマットが完了しました。")
  else
    vim.api.nvim_err_writeln("エラー: eslintのフォーマットに失敗しました。")
    vim.api.nvim_err_writeln(output)
  end
end, {})
