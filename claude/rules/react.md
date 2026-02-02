# React Rule

## useEffect の原則

**Effectは外部システムとの同期専用。それ以外は使わない。**

## Effectが不要なケース（useEffect禁止）

| ケース | 代替手段 |
|--------|----------|
| props/stateからの計算 | レンダリング中に計算（変数代入） |
| 高価な計算のキャッシュ | `useMemo` |
| prop変更時のstate全リセット | `key`を変える |
| prop変更時の一部state調整 | IDを保存して計算で導出 |
| イベントハンドラ間の共有ロジック | 関数に抽出してハンドラから呼ぶ |
| ユーザー操作によるPOST | イベントハンドラで直接実行 |
| Effectのチェーン | イベントハンドラで全て計算 |
| 親への状態通知 | イベントハンドラ内で親のonChangeも呼ぶ |
| 親へのデータ渡し | 親でfetchして子にpropsで渡す |

## Effectが必要なケース

- コンポーネント表示時のanalytics送信
- 外部ストア購読（ただし`useSyncExternalStore`優先）
- データフェッチ（クリーンアップ必須、カスタムHook推奨）

## フェッチのrace condition対策（必須）

```tsx
useEffect(() => {
  let ignore = false;
  fetch(url).then(res => res.json()).then(data => {
    if (!ignore) setData(data);
  });
  return () => { ignore = true; };
}, [url]);
```

## 判断基準

- 「ユーザー操作が原因か？」→ イベントハンドラ
- 「コンポーネント表示が原因か？」→ Effect
- 「計算で出せるか？」→ レンダリング中に計算
