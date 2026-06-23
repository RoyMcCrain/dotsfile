# Plugin Rule

## オンデマンド方針

重い MCP プラグインは `~/.claude/settings.json` の `enabledPlugins` で `false` にしている。
起動時の deferred-tool 一覧と MCP instructions を context から外し、ノイズを減らすため。

無効化中: `playwright` / `figma` / `dbt` / `cloudflare` / `slack` / `shopify` / `stripe`

## 使う時の点灯手順（再起動不要）

```
/plugin            # 対象プラグインを ON
/reload-plugins    # 反映（MCP込みで有効化）
```

- MCP を持つプラグインの reload は prompt cache を無効化するため、直後の1リクエストが割高
- どのプロジェクトでも上記手順で点灯できる（repo 非依存）
