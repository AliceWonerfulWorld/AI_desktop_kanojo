# 実際に配置した素材の台帳

機械可読の正本は [manifest.json](manifest.json)。現在配置済みなのは `test/*.png` の4枚だけで、**正式な小春画像ではない**。承認済みデザインを再現・変更するための素材でもない。

| 項目       | 実際の内容                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------ |
| 出典       | このリポジトリの `scripts/generate-test-character.cjs` による幾何図形のラスタライズ              |
| 入手元     | 外部サイト・素材集からの取得なし                                                                 |
| AI 利用    | Codex によるコード作成支援あり。画像生成モデル・生成サービス・外部原画の利用なし                 |
| 作成日     | 2026-11-07                                                                                       |
| ライセンス | テスト PNG と生成スクリプトのみ MIT。`LICENSE-test-assets.txt` を同梱                            |
| 配置状態   | idle/neutral、idle/smile、idle/sleepy、idle/surprised のテスト素材のみ配置済み                   |
| 本番素材   | 承認済み参考画像の配置、本番ランタイム画像、読書・休憩・睡眠、照れ・甘え専用画像は未制作・未配置 |

再生成は `npm run assets:test`。Node.js 標準ライブラリだけで同じ PNG を生成する。通常の clone / 起動時はコミット済み PNG を使い、生成処理は不要。

素材追加時は manifest に ID・相対パス・意味上の行動/表情・状態を登録し、実際の出典、AI利用サービス/モデル、利用条件、権利確認日を記録する。異なる出典・ライセンスの素材は個別の記録を追加し、現在のテスト素材の MIT 条件を流用しない。本番利用の可否を確認できない素材や再配布禁止素材はコミットしない。

`src/renderer/src/character/assets.ts` へ明示的な import と URL 登録を追加するとビルド対象になる。manifest の状態マッピングをコードへ読み込み、任意のファイルパスやネット URL は Renderer の公開 API で受け付けない。通常表情はコード上 `neutral` に統一し、デザイン資料の `normal` に対応させる。

## 小春の本番候補について

Geminiで生成された5枚のWebP画像が会話で受領済み（572×1024、RGB、白背景・非透過）。**GitHubには未配置**。本台帳の既存4枚のテストPNGとは別扱いにする。詳細は [koharu/manifest.md](koharu/manifest.md)。将来の素材統合に関するCodex指示は [docs/15-codex-asset-integration.md](../../docs/15-codex-asset-integration.md)。
