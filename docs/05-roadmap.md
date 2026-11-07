# ロードマップとIssue対応

> 実際のハッカソン日程・チーム人数は未確認のため、所要日数ではなく依存順に整理する。

## 0. 技術リスクを先に検証
- [#1 Electron + TypeScript 開発環境](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/1)
- [#2 透明・常駐ウィンドウ](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/2)
- 最初は仮PNG1枚で、「透明表示」「ドラッグ」「クリック透過」の実現可能性を検証する。

## 1. キャラクターの存在感を作る
- [#3 2D立ち絵・差分表示](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/3)
- [#6 クリック交流・吹き出し](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/6)
- 画像1枚だけでなく、少なくとも表情の変化と一言の反応を出す。

## 2. 自律生活を成立させる
- [#4 行動状態遷移](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/4)
- [#5 時刻連動](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/5)
- 放置デモで「勝手に暮らしている」魅力を見せる。

## 3. 少しずつ距離が縮まる
- [#7 親密度・関係ステージ](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/7)
- [#8 ローカル永続化](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/8)
- セーブして再起動すると、前回の関係性が残る。

## 4. 常用性とデモ完成
- [#9 設定・邪魔しないモード](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/9)
- [#10 macOSビルド・テスト](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/10)
- macOSメニューバー・終了、デモ動作、README、Apple Silicon実機テストを確認。

## 5. MVP後・販売準備
- [#11 イラスト・動作・会話を拡充](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/11)
- [#12 DLsite販売の確認・準備](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/12)

## デモのストーリー（例: 90秒）
1. デスクトップの端に彼女がいる。
2. 今は本を読んでいて、時々こちらを見る。
3. クリックで一言返事し、表情が変わる。
4. テスト用の時刻を変えると眠る（実装時に開発者用モードで再現）。
5. アプリを終了・再起動すると交流記録が残っている。

## 優先順位の原則
- **最優先**: 透明表示 + 表情/動作 + 自律行動 + 再起動時の復元
- **次点**: 関係性・設定の使いやすさ
- **後回し**: AI会話・音声・Live2Dの高度なリギング・成人向け本編

## リリース判断
- ハッカソン: デモ可能なMVPを優先。
- DLsite: 素材の商用権利、審査基準、対応OS別の配布品質確認後に公開。

## Live2D優先拡張（目標）
- [#15 Cubism SDK for Web 技術検証](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/15)
- [#16 Live2D描画アダプターと自律行動統合](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/16)
- PNGのMVPを壊さない。SDK・モデルのライセンス確認、透明描画とクリック透過、実機での描画負荷を検証。
- 詳細は [Live2D導入計画](09-live2d-plan.md) を参照。

## 対応OSの方針
- 開発・最初のMVP検証: macOS（Apple Silicon / MacBook Air）。
- Windows: OS固有のウィンドウ操作と配布物を別の環境で検証してから対応表記する。
- 共通ロジック・UI・Live2D描画を可能な限り共有する。
