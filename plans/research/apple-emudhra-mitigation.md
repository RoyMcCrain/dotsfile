# Apple eMudhra CA mitigation

確認日: 2026-10-28。一次資料: https://support.apple.com/en-us/149555 （公開日: 2026-10-23）。

- Apple の networking/security frameworks は自動ブロック済みだが、`/etc/ssl/cert.pem` を使う CLI には別の対応が必要な場合がある。
- Apple は同ファイルをバックアップし、`emSign ECC Root CA - G3` を除去する手順を案内している。
- Sectigo の cross-signed 経路も遮断するには、任意の追加手順として `AAA Certificate Services` も除去する。
- 両ルート配下の無関係な正規サイトも検証できなくなる可能性がある。独自 CA bundle を使うツールは別途確認が必要。
- Apple の修正を含む OS 更新までは、更新でファイルが置き換わる可能性があるため再確認が必要。
- ローカルの macOS 27.2 で両ルートが残っていることを確認後、ユーザーの依頼により 2026-10-28 に Apple のフィルターで両方を除去した。macOS の管理者認証を利用し、バックアップを `/etc/ssl/cert.pem.orig` に保存した。
- 適用後の証明書数は 128 → 126。OpenSSL で解析成功、両ルートなし、検証済みコピーとの完全一致、バックアップと変更前の完全一致、所有者・権限 `root:wheel 644` を確認済み。
- 標準 `curl` は `/usr/bin/curl`、通常の `git` は devbox 由来だった。後続確認では Git / Nix / Homebrew の別 bundle と、Node / Deno / Bun / Java の CA 一覧に対象ルートが残っていた。ランタイムの公式修正版と Devbox 更新検証は [emudhra-runtime-updates.md](emudhra-runtime-updates.md) を参照。

調査キャッシュ: `.firecrawl/apple-149555.md`、`.firecrawl/apple-149555-grok-summary.txt`。
Grok X Search の公開投稿は CLI と OS 更新に関する注意点で公式本文と整合したが、Apple 公式 X 投稿は見つからず、補助情報としてのみ扱った。
agy は headless の command 権限不足で取得できず、横断推論レーンは欠落。判断は取得した Apple 公式本文を根拠とする。
