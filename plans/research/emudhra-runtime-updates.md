# eMudhra: ランタイム更新による対策

確認日: 2026-10-28。対象はこの環境の Node.js / Deno / Bun / Eclipse Temurin 21。

## 結論

４つとも、将来の対応予定ではなく公式修正版が公開済み。独自 CA bundle の恒久的な手動改変より、まず公式修正版への更新を優先する。
初回調査では Devbox パッケージ指定を一時コピーで更新しても、４つとも導入済みと同じ版に解決された。その後、ユーザーの更新依頼により Node 26 と他３つの修正版を実環境へ反映した（後続の更新・検証を参照）。

| ランタイム | 更新前 | 公式に修正を確認した版 | 根拠 |
| --- | --- | --- | --- |
| Node.js 24 | 24.21.0 | 24.22.1 | October 21 security releases と v24.22.1 の release notes |
| Deno | 2.9.7 | 2.9.8 | v2.9.8 release notes、denoland/deno#37046 |
| Bun | 1.4.2 | 1.4.4 | GHSA-26q8-h657-pf84: affected < 1.4.4、patched 1.4.4 |
| Eclipse Temurin 21 | 21.0.12.1 | 21.0.13+9 | Adoptium の 2026-10-27 公式告知 |

すべて macOS / Apple Silicon の公式配布物があることも確認した。Node は release notes の darwin-arm64 リンク、残りは GitHub Releases API の assets 一覧で確認。Deno の公開日は 2026-10-21、Bun と Temurin の公開日は 2026-10-22（API の published_at）。

## 修正内容と注意点

- **Node.js:** CA データを NSS 3.131.1 に更新（nodejs/node#66877）。同じリリースに compromised public keys を含む証明書チェーンの拒否も入る（#66871）。24 系のまま更新でき、26 系へのメジャー更新は必須ではない。
- **Deno:** rustls-webpki 0.103.16 で８つの漏えい公開鍵を含む経路を拒否し、cross-signed 証明書も対象とする。webpki-roots / webpki-root-certs 1.0.10 で emSign ECC Root CA - G3 を除去する。
- **Bun:** ルート削除と８つの公開鍵によるチェーン拒否の両方を実装。system store、NODE_EXTRA_CA_CERTS、SSL_CERT_FILE、SSL_CERT_DIR、明示的 ca の経路も拒否対象と公式 advisory にある。`bun build --compile` の既存実行ファイルは Bun 本体の更新だけでは直らず、修正版で再ビルドが必要。
- **Temurin:** upstream OpenJDK と CA データの作り方が異なる。公式告知は NSS 3.131.1 のデータを利用し、emSign ECC Root CA - G3 と AAA Certificate Services の除去を明記し、21.0.13+9 を修正版として列挙している。
- **Java の検査の注意:** Adoptium は、OpenJDK の CheckCerts が emSign Root CA - G1 も BAD ROOT と表示する点に注意を促している。G1 は今回の漏えい intermediate と無関係として Mozilla / Temurin に残っている。単純な emSign 全件削除や文字列一致だけでの判定は避ける。
- 初回調査では CA 含有のみ検査し、後続の更新後に実ランタイムの TLS 接続も確認した。upstream 修正版と同じ protection が独自 backport にあるかどうかは、バージョン番号だけでは判定しない。
- Git、Nix 本体、Homebrew の独自 CA bundle は別管理であり、この４ランタイムの更新だけで同時に更新されるとは限らない。

## Devbox での確認

`devbox/devbox.json` と global `devbox.lock` を `.firecrawl/` 内の一時ディレクトリへコピーし、次を実行した。

```sh
devbox update --config <temporary-copy> --no-install nodejs_24 deno bun temurin-bin-21
```

結果はすべて `Already up-to-date` で、解決版は次のままだった。

- `nodejs_24@latest`: 24.21.0
- `deno@latest`: 2.9.7
- `bun@latest`: 1.4.2
- `temurin-bin-21@latest`: 21.0.12（実行時表示は 21.0.12.1）

global lockfile の SHA-256 が不変であることを確認した。
これは「現在の指定での更新では届かない」という結果であり、Devbox の全パッケージ名・全 Nixpkgs リビジョンで修正版が取得不可能という意味ではない。
検索では汎用 nodejs の 26.12.1 も見えたが、現在の nodejs_24 の指定とは区別する。

## 後続の更新・検証（2026-10-28）

- Node.js: **26.12.1**（`nodejs@26`）。
- Deno: **2.9.8**、Bun: **1.4.4**、Eclipse Temurin: **21.0.13+9**。
- 他３つはカタログにも調査時点の Nixpkgs master にも修正版がなかったため、`devbox/runtime-packages/flake.nix` で公式バイナリと SHA-256 を固定した。Bun / Temurin は既存 Nixpkgs のプラットフォーム別 packaging を再利用し、無関係な依存更新を避けた。
- global の `runtime-packages` を symlink にする方式は Nix pure evaluation に拒否された。制約を緩めず、global 側に実ディレクトリを作り `flake.nix` と `flake.lock` をコピーする構成に修正した。同期方法は README の Runtime versions を参照。
- 実体コピーでの pure `nix search`、`devbox global install`、実コマンドの版表示を確認済み。無関係な直接指定パッケージの version / resolved は更新前後で一致した。
- Nix flake check / 評価は aarch64-darwin・x86_64-linux・aarch64-linux で成功。ビルドと実行の確認は実機の aarch64-darwin のみ。
- `fish -n scripts/build_env/setup_fish.sh` は成功。`fish_indent --check` は既存整形差分により変更前後とも失敗しており、無関係な全体整形は行っていない。
- Node / Deno / Bun / Java の４つそれぞれで `https://example.com/` への HEAD は HTTP 200、`dv-g3b-emudhra.we-have-a-problem.com` と `dv-g3b-aaa-emudhra.we-have-a-problem.com` は証明書エラーで拒否された。同じチェックが旧版では失敗し、新版では成功することを確認した。これは TLS の２経路の代表例であり、全 intermediate や Java のコード署名を検査したものではない。
- 拒否理由: Node / Bun は `CERT_REVOKED`、Deno は `CertDistrusted`、Java は `SSLHandshakeException` / PKIX path building failed。
- `npm --version` / `pnpm --version` / `pi --version` / `codex --version` / `tsc --version` の smoke test は成功。
- 検証ログは `.firecrawl/runtime-*-tls-{before,after}.*`、`.firecrawl/runtime-global-install-final.log` に保存。Git / Nix 本体 / Homebrew の別 CA bundle はこのランタイム更新では変更していない。

## 一次資料

- Node.js security releases: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- Node.js 24.22.1: https://nodejs.org/en/blog/release/v24.22.1
- Deno 2.9.8: https://github.com/denoland/deno/releases/tag/v2.9.8
- Deno TLS 修正: https://github.com/denoland/deno/pull/37046
- Bun advisory: https://github.com/oven-sh/bun/security/advisories/GHSA-26q8-h657-pf84
- Bun 1.4.4: https://bun.com/blog/bun-v1.4.4
- Temurin 公式告知: https://adoptium.net/news/2026/10/temurin-october-2026-emudhra
- Temurin 21.0.13+9: https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.13%2B9
- OpenJDK guidance: https://openjdk.org/emudhra

## 調査レーンとキャッシュ

Firecrawl で公式本文を取得し、GitHub API GET で配布 assets を確認。Grok X Search は Deno / Bun の公式投稿で修正版を補強したが、Node / Temurin の正確な修正版の根拠は公式 Web 本文を採用した。
agy も調査できたが、NSS の AAA 含有や Java の CVE 等に一次資料との不一致があり、裏取りできない詳細は採用していない。
キャッシュは `.firecrawl/emudhra-*`。Devbox の検証出力は `emudhra-devbox-probe-update.txt`、配布確認は `emudhra-{deno,bun,temurin21}-mac-assets.json` に保存。
