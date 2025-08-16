# vim-abolish - ケース変換

## キーマッピング

caseコマンド: `cr` + 変換タイプ

| キー | 説明 | 例 |
|------|------|-----|
| crc | camelCaseに変換 | someVariable |
| crs | snake_caseに変換 | some_variable |
| crm | MixedCase(PascalCase)に変換 | SomeVariable |
| cru | UPPER_CASEに変換 | SOME_VARIABLE |
| cr- | kebab-caseに変換 | some-variable |
| cr. | dot.caseに変換 | some.variable |

## コマンド

| コマンド | 説明 | 例 |
|----------|------|-----|
| `:Subvert/{pattern}/{replacement}/[flags]` | 高度な置換（複数の変種を同時に置換） | `:Subvert/facilit{y,ies}/building{,s}/g` |
| `:Abolish {abbreviation} {replacement}` | 略語の定義（全ケースバリエーション） | `:Abolish teh the` |
| `:S/{pattern}/{replacement}/[flags]` | Subvertの短縮形 | `:S/old/new/g` |

## 使用例

### ケース変換
```vim
" カーソル下の単語をcamelCaseに変換
crc

" ビジュアル選択した範囲をsnake_caseに変換
v<選択>crs
```

### 高度な置換
```vim
" facility/facilitiesをbuilding/buildingsに一括置換
:Subvert/facilit{y,ies}/building{,s}/g

" 検索のみ（置換なし）
/\vfacilit(y|ies)
```

### 略語定義
```vim
" よくあるタイポを自動修正
:Abolish teh the
:Abolish recieve receive
:Abolish seperate separate
```