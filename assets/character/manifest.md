# 素材台帳

通常ランタイムの正本は [manifest.json](manifest.json)。ユーザーが選定しmainに配置した小春の透過PNG6表情を読み込む。出典、画像寸法、アルファ検査、未確認の公開/商用/成人向け配布条件は [小春素材台帳](koharu/manifest.md) に記録する。**小春画像はMIT素材ではなく、リリース許諾未確認。**

## テスト専用素材

`test/*.png` の幾何図形4枚と `scripts/generate-test-character.cjs` は保持する。登録は [test/manifest.json](test/manifest.json)、読み込みは `src/renderer/src/character/test-assets.ts`。通常アプリからimportせず、表情切替・代替画像として突然現れない。

| 項目   | 内容                                                                                 |
| ------ | ------------------------------------------------------------------------------------ |
| 出典   | `scripts/generate-test-character.cjs` による幾何図形のラスタライズ                   |
| AI利用 | Codexによるコード支援。画像生成モデル・外部原画の利用なし                            |
| 作成日 | 2026-11-07                                                                           |
| 条件   | テストPNGと生成スクリプトのみMIT。[LICENSE-test-assets.txt](LICENSE-test-assets.txt) |
| 状態   | idle/neutral、smile、sleepy、surprisedの4枚。正式小春画像ではない                    |

`npm run assets:test` でテスト画像だけを再生成する。通常のclone/起動で生成は不要。両manifestの `assets[].file` は `assets/character/` を基点にする。

素材を追加するときは、状態対応・出典・AI利用・個別条件と確認状況を記録し、`assets.ts` に明示的な静的importとURLを登録する。任意のパスやネットURLはRenderer APIから受け付けない。
