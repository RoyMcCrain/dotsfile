# Cloudflare security-audit skill の導入判断

確認日: 2026-10-26。公開情報の調査のみ実施し、スキルの導入・監査実行はしていない。

## 結論

通常の差分レビューを置き換えるのではなく、明示的に起動するセキュリティ監査の補完として導入価値がある。実際の検出性能と、この環境での実行互換性は未検証。

- 既存の `parallel-review` は秘密検査済み patch を複数 reviewer に渡す。`security-audit` は対象ソースの構造・trust boundary・入力面を調べ、監査範囲を記録して脆弱性候補を探索する。対象はリポジトリ全体にも限定パス・差分にもできる。
- 発見役とは別の fresh agent が候補を反証し、`confirmed` / `needs_validation` / `rejected` を区別する。単なるベストプラクティス違反を脆弱性として扱わない設計。
- `coverage-ledger.json` と過去の findings を利用して、未調査・変更箇所を次回の対象にできる。
- Cloudflare 専用ではない。Web/auth、LLM・agent、supply chain、cloud deployment、data isolation、native/local IPC などの参照資料がある。

## 導入・運用上の注意

- 実際の skill 名は `security-audit`。このリポジトリの慣例なら canonical 配置は `skills/security-audit/`。`scripts/build_env/list_shared_agent_skills.sh` は `skills/*/SKILL.md` を列挙するため、個別 allowlist 追加は不要。ただし実際の link 更新と各 agent の認識確認は導入時に必要。
- `SKILL.md` は guidance と full audit を区別する。単なる質問では六段階の監査や出力ファイル作成を自動開始しない。既存のレビュー運用に常時組み込む必要はない。
- Full audit は独立 sub-agent、Node.js、分離された書き込み領域を要求する。ガイドを追加するだけで実行基盤が揃うわけではない。Pi への delegation 対応は未確認。
- 対象コードの実行には OS 強制 sandbox が必要。外部 network 無効、allowlist 環境、target/toolchain の read-only 化、scratch 以外の書き込み禁止、CPU/memory/process/disk/time 制限などを要求する。通常の headless process や workspace 分離だけで充足したとは扱わない。
- 要件を満たせない場合は対象コードを実行せず、決定的な検証ができない候補を `needs_validation` に留める。
- 複数 agent の呼び出しコストがある。最初は範囲を絞った `quick` と invocation budget を明示する運用が妥当。最低限の reconnaissance・critic・verifier の予算も必要。
- 一回の監査は安全性を保証しない。README の「一回は反復実行の合計の約半分を発見」は Cloudflare 自身の試行についての記述で、一般的な recall やこの環境の実測値ではない。
- Blog の fleet-wide harness はこの skill から発展した別の実行基盤。その検出件数・費用・所要時間を公開 skill 自体の性能として扱わない。

## 出典と取得記録

公式 repo の取得時の main は `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`（2026-09-14）。取得時刻は 2026-10-26 UTC。

- [公式 README](https://github.com/cloudflare/security-audit-skill): 六段階の workflow、成果物、要件、反復実行の注意。Firecrawl cache: `.firecrawl/cloudflare-security-audit-readme.md`。
- [公式 SKILL.md（固定 revision）](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/SKILL.md): guidance/full audit、実行安全性、profile・budget、独立検証。Firecrawl は同 revision の `raw.githubusercontent.com` 本文を取得。Cache: `.firecrawl/cloudflare-security-audit-skill.md`。
- [Cloudflare Blog: Build your own vulnerability harness](https://blog.cloudflare.com/build-your-own-vulnerability-harness/): skill から fleet harness への発展と、反復・独立検証・費用の説明。現行 README の六段階と異なり、初期 skill を七段階として説明しているため、現行運用は README/SKILL.md を優先。Cache: `.firecrawl/cloudflare-vulnerability-harness.md`。
- [Cloudflare の X 告知](https://x.com/Cloudflare/status/2067669887141499143): Grok X Search が上記 blog の告知を発見。公式投稿は repo 自体の詳細仕様の根拠には用いない。一般投稿の人気・体験談も性能の証拠には用いない。Raw cache: `.firecrawl/cloudflare-security-audit-grok-x.json`。

Cross-research は Firecrawl と Grok X Search で突合。`agy` は未導入で横断推論レーンが欠落。Firecrawl CLI も PATH にはなく、`npx --yes firecrawl-cli`（実行時 v1.26.22）の未認証 scrape で公式本文を取得できた。旧 `@1.19.6` の search は認証を要求して取得できなかった。
