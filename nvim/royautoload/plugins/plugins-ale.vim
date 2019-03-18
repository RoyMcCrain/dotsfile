" 左端のカラムを常に表示
let g:ale_sign_column_always = 1
" ファイルを開いたときにlint実行
let g:ale_lint_on_enter = 1
" 保存時のみ実行する
let g:ale_fix_on_save = 1
let g:ale_completion_enabled = 1
let g:ale_completion_delay = 200
let g:ale_lint_on_text_changed = 'never'
let g:ale_echo_cursor = 0
" 提案数を指定する
let g:ale_fixers = {
  \ 'javascript': ['standard', 'prettier'],
  \ 'typescript': ['prettier'],
  \ 'ruby': ['rubocop']
  \ }
let g:ale_linters = {
  \ 'javascript': ['standard'],
  \ 'typescript': ['tsserver', 'eslint'],
  \ 'ruby': ['solargraph', 'rubocop']
  \ }
" ショートカット
nmap <Leader>aj <Plug>(ale_previous_wrap)
nmap <Leader>ak <Plug>(ale_next_wrap)
nmap <Leader>ad <Plug>(ale_detail)
nmap <Leader>at <Plug>(ale_toggle)
