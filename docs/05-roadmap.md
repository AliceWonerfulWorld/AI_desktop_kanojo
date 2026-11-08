# ロードマップとIssue対応

> 2026-11-08 / Issue #13: 現行優先度はPNG＋日常生活＋親密度＋イベント。UIのD1/D5/D6/D10はユーザー承認済み、その他は推奨案・最終確認待ち。設計承認と実装完了は別。

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
- **次の設計/実装候補**: #13のD1/D5/D6/D10承認を反映し、その他推奨案を最終確認 → 承認部分を #29（明示モード切替）/#30（イベント基盤）/#37（一般向け衣装切替）へ引き渡す。#29/#30は全年齢プレースホルダーで検証可能、#37の部屋着は採用PNGの配置が前提。
- **イベントの段階**: #29＋#30 → #31（承認済み台本・実在素材の初回イベント）→ #32（ログ/既読/オート）・#33（回想/CG鑑賞）。#34は途中から回帰検証を整え、#10配布・#12権利確認と分担する。
- **保留/対象外**: Live2D #15/#16/#23/#25は一時保留。AI会話・音声を明示Issueなしに追加しない。

## リリース判断
- ハッカソン: デモ可能なMVPを優先。
- DLsite: 素材の商用権利、審査基準、対応OS別の配布品質確認後に公開。

## Live2D再検討（現在は一時保留）
- [#15 Cubism SDK for Web 技術検証](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/15)
- [#16 Live2D描画アダプターと自律行動統合](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/16)
- PNGのMVPを壊さない。SDK・モデルのライセンス確認、透明描画とクリック透過、実機での描画負荷を検証。
- 現時点ではPNG＋イベントの進行条件にしない。再開時期は別途判断する。
- 詳細は [Live2D導入計画](09-live2d-plan.md) を参照。

## 対応OSの方針
- 開発・最初のMVP検証: macOS（Apple Silicon / MacBook Air）。
- Windows: OS固有のウィンドウ操作と配布物を別の環境で検証してから対応表記する。
- 共通ロジック・UI・Live2D描画を可能な限り共有する。

## UI設計レビューの成果物

[UI方針・現行棚卸し](07-ui-ux.md)、[ワイヤーフレーム2案](08-screen-layouts.md)、[遷移・操作・要承認事項](25-ui-interaction-design.md)。#9の設定は実装済みで再実装しない。桜の小花柄パジャマは一般向け衣装として #37 へ渡し、成人専用モードと独立させる。

## Issue #37 の実装状態

D7はユーザー承認済み。衣装レジストリ、既存設定内の明示適用→自動保存、同衣装fallback、旧v1の補完を実装。部屋着3PNGを受領・登録し、通常/照れ/笑顔・明示切替・再起動復元を自動検証。画像品質・happyの表情対応・実機QA・メモリの残課題は [検証記録](28-outfit-registry-validation.md)。
