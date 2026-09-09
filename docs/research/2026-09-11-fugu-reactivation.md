# Fugu Max / Fugu Ultra v2 の復活

確認日: 2026-09-11。ユーザーの明示依頼により利用を再開する。

## 確認結果

| 用途 | API model ID | reasoning |
| --- | --- | --- |
| 通常の Fugu ルーティング | `fugu-max` | `high` / `xhigh`（`max` は `xhigh` の別名） |
| 昇格・Fugu 単体レビュー・parallel-review L3 | `fugu-ultra-v2.0` | 同上 |

- `fugu-max` は `fugu-max-v1.0` の alias。Ultra は世代が変わらないよう `fugu-ultra` alias ではなく v2.0 を指定する。
- provider は既存の `sakana-ai-console`、base URL は `https://api.sakana.ai/v1`、Pi は `openai-responses` を使う。
- 既存 Keychain 認証による `GET /v1/models` は HTTP 200。両 ID が一覧に含まれることを確認した。推論リクエストは送っていない。
- 公式 Codex catalog は Max / Ultra v2 とも `context_window: 1000000`。Pi は従来のローカル運用上限 `contextWindow: 300000` を維持する。
- Pi の `maxTokens` は Max `32768`、Ultra `8192` を従来設定から継承する。これはクライアント側の出力上限であり、新モデルの API 最大出力長を確認した値ではない。
- 起動時の既定モデル・既存認証は変更しない。parallel-review の L1/L2 は既存4 reviewer、L3 のみ Fugu を復帰して5 reviewer とする。

## 出典と突合

- [公式 Models](https://console.sakana.ai/models): model ID、alias、Responses API、reasoning effort。`.firecrawl/restore-fugu-search.json` / `.firecrawl/restore-fugu-models.md`。
- [公式 Get started](https://console.sakana.ai/get-started): 新モデルの Codex catalog と 1M context、reasoning の対応。`.firecrawl/restore-fugu-get-started.md`。
- [公式製品ページ](https://sakana.ai/fugu/): Max / Ultra v2 の公開と位置付け。`.firecrawl/restore-fugu-search.json`。
- [公式 X 告知](https://x.com/SakanaAILabs/status/2098233826816205275): Grok X Search で公開を突合。X 投稿には正確な API ID や容量仕様はないため、その根拠には用いない。`.firecrawl/restore-fugu-grok.json`。
- agy は120秒 timeout で有効な回答なし。横断推論レーンは欠落しているが、実装に用いる ID は公式本文と認証済み API 一覧で確認した。
