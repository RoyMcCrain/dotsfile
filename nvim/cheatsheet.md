# Cheat Sheet

## vim

### move

- "gg" : ファイルの先頭へ
- "G"  : ファイルの末尾へ
- "I"  : 行頭でインサート
- "A"  : 行末でインサート
- "J"  : 現在の行と次の行を連結する 

### NERDTree設定
- "<Leader>n" : :NERDTreeToggle

### ale設定
Space + kで次の指摘へ、Space + jで前の指摘へ移動
- "<Leader>k" : ale_previous_wrap
- "<Leader>j" : ale_next_wrap

### caw.vim

行の最初の文字の前にコメント文字をトグル
- <Leader>/ : caw:hatpos:toggle
行頭にコメントをトグル
- <Leader>0 : caw:zeropos:toggle
