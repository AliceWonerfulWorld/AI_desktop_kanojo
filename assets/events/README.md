# イベント用の全年齢ダミー素材

`tea-card.svg` はIssue #30の動作確認用にコードで作成した、幾何図形のお茶のカップ。外部の画像・商標・UI素材・画像生成AIは使用していない。イベントデータは `src/events/data/sample.json`、アセットIDと静的importの対応は `src/renderer/src/events/view.ts` に分離する。

本番CGや小春のイラストを追加したものではない。既存の小春PNGの出典・未確認の配布条件は [キャラクター素材台帳](../character/koharu/manifest.md) を維持。`missing-card` は欠損時の代替表示を検証する意図的な未配置IDで、ネットURLや任意パスへ変換しない。

## Issue #44の図形fixture

`wide-card.svg` / `wide-smile-card.svg`（16:9の同一構図差分）、`four-card.svg`（4:3）はコードで作った全年齢の幾何図形。既存`tea-card.svg`は4:5の縦長。生成AI/外部画像/成人向け素材は使用していない。Rendererの`broken-card`はエラー検証用の意図的に画像ではないdata URLで、通常カタログでは使用しない。正式CGの制作・権利確認は別工程。
