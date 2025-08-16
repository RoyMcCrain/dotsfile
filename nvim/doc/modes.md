# モード別キーマップ

## Normal モード
基本操作、ウィンドウ操作、プラグイン操作のほとんどが利用可能

## Visual モード
| キー | 説明 |
|------|------|
| C-j | 矩形選択（C-vの代替、貼り付けと競合回避） |
| gcc | 選択範囲を一行コメント化 |
| gbc | 選択範囲をブロックコメント化 |
| s | hop.nvim: 2文字ジャンプ |
| t + [方向] | hop.nvim: 方向指定ジャンプ |

## Insert モード
| キー | 説明 |
|------|------|
| C-t | Tailwind CSS補完を表示 |
| C-n | 補完候補を選択（次の候補） |
| C-p | 補完候補を選択（前の候補） |
| C-k | 補完を確定 |
| C-e | 補完をキャンセル |

## モード切り替え
| 操作 | キー | 説明 |
|------|------|------|
| Normal → Insert | i | カーソル位置で挿入 |
| Normal → Insert | a | カーソル後で挿入 |
| Normal → Insert | o | 下に新行で挿入 |
| Normal → Insert | O | 上に新行で挿入 |
| Normal → Visual | v | 文字選択モード |
| Normal → Visual Line | V | 行選択モード |
| Normal → Visual Block | C-j | 矩形選択モード |
| Any → Normal | Esc | Normalモードへ |
| Insert → Normal | C-[ | Normalモードへ |