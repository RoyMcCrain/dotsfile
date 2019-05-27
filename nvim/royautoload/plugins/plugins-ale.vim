" 左端のカラムを常に表示
let g:ale_sign_column_always = 1
" ファイルを開いたときにlint実行
let g:ale_lint_on_enter = 1
" 保存時のみ実行する
let g:ale_fix_on_save = 1
let g:ale_completion_enabled = 0
let g:ale_lint_on_text_changed = 'never'
let g:ale_echo_cursor = 0
" 提案数を指定する
let g:ale_fixers = {
  \ 'javascript': ['prettier'],
  \ 'typescript': ['prettier'],
  \ 'json': ['prettier'],
  \ 'ruby': ['rubocop']
  \ }
let g:ale_linters = {
  \ 'javascript': ['eslint'],
  \ 'typescript': ['eslint'],
  \ 'ruby': ['solargraph', 'rubocop']
  \ }
" ショートカット
nnoremap [ALE] <Nop>
nmap <Leader>a [ALE]
nmap <silent> [ALE]j <Plug>(ale_previous_wrap)
nmap <silent> [ALE]k <Plug>(ale_next_wrap)
nmap <silent> [ALE]d <Plug>(ale_detail)
nmap <silent> [ALE]t <Plug>(ale_toggle)
