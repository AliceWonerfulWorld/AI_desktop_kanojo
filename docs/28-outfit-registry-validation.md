# Issue #37 衣装レジストリ・検証記録（素材受領待ち）

## 現在の範囲

衣装の基盤、既存設定内の明示適用、保存互換、描画/入力の回帰検証を追加した。**Issue #37の完了ではない。** 採用済み部屋着3PNGの受領・実登録と、その素材を使った切替/再起動/実機QAが残る。普段着6表情を維持し、部屋着は「素材準備中」で選択不可。画像は生成・加工・代用しない。

作業開始時のmainには不採用の `loungewear_shy_trial.png` / `loungewear_affectionate_trial.png` があったが、ランタイムへ登録・importしていない。採用済み `loungewear_neutral.png` / `loungewear_shy.png` / `loungewear_affectionate.png` は受領していない。存在しないPNGのランタイムパスも登録しない。

## レジストリと同衣装内フォールバック

- `src/shared/outfits.ts`: Action/Expressionから独立した `OutfitId`。`default` / `loungewear`。
- `assets/character/manifest.json`: 衣装の表示名とready/pending、および各アセットのoutfitId/action/expression。素材台帳の出典/権利記録とは分離。
- `src/shared/character-manifest.ts`: 型、限定ID/パス、重複衣装/状態/ファイル、未準備衣装への画像登録、neutral欠落、不採用trialを検証。ready衣装にはidle/neutralが必須。
- `src/renderer/src/character/assets.ts`: 受領済み6PNGだけの静的URL表。テストPNG/不採用trial/コピーは通常ビルドから参照しない。
- 衣装を省略した旧VisualState・旧テスト素材はdefaultとして後方互換を維持。行動/表情とPNGパスを結合しない。
- 同衣装のaction/expression → 同衣装idle/expression → 同衣装action/neutral → 同衣装idle/neutral。部屋着で不足したsmile/shy/affectionate等から普段着へ戻らない。既存defaultだけは従来のshy/affectionate→smile→neutralの順を維持する。
- Rendererの `setOutfit` は表示中の意味状態を保つ。行動遷移・クリック反応・一時表情の復元も選択中の衣装を使う。イベントの立ち絵にも保存衣装IDを渡し、CG選択とは独立する。

## D7の明示適用と失敗

既存#9設定へ「衣装」欄を追加。右クリックの新しい衣装入口や別の設定画面は作らない。候補のキーボード移動/changeだけでは保存・表示を変更しない。「この衣装を適用」ボタンからのみMainへ要求する。

1. Mainが設定ウィンドウのmainFrame、既知ID、ready状態、終了/初期化/重複適用を検証。
2. 一時token付きの要求を表示状態で日常Rendererへ渡す。実際のRendererで対象neutralをデコードし、元解像度のアルファマスクを準備する。この段階で表示・クリック領域は変えない。
3. 同じ日常mainFrameからtoken一致の成功応答が来た場合だけ、Mainが選択IDを更新し、既存保存の自動保存を要求して表示状態を通知する。任意パス・URL・セーブ内容をIPCで受け取らない。通常のsettings.updateから衣装IDを変更できない。
4. Rendererはキャッシュ済みneutralを確保してから衣装を切り替える。不足/読込失敗した表情は同衣装neutralへ戻す。多重切替では新しい要求だけを適用する。
5. 読込失敗・8秒応答期限・設定閉鎖・日常再読込・初期化・終了では適用を取り消し、以前の選択/表示を維持する。保存失敗は既存の非ブロッキング警告で通知し、終了・非表示は妨げない。

UIは素材準備中、適用開始、読込中、成功、失敗を区別し、適用中は衣装欄の重複操作を止める。他の既存設定・非表示・閉じるは利用できる。衣装は一般向けで、親密度・時刻・衣装の選択だけで専用モードを開かない。#29の明示入場・確認・許可の非保存を維持。

## 保存と移行

既存schemaVersion 1の `settings.outfitId` を追加。欠落・未知・不正型ならdefaultへ補完し、親密度・交流回数・設定・イベント進行を初期化しない。既知でも未準備/削除済みの衣装は起動時にレジストリと照合してdefaultへ戻し、既存 `MemoryStore` の検証/バックアップ/原子的置換で保存する。新DBや衣装固有の関係性データは作らない。

## 検証

- `npm run check`: lint/format、単体85件、型チェック、ビルド成功。レジストリ不正、全Action×Expressionの衣装分離、旧/不明ID移行、衣装IDの保存往復を追加。
- `npm run test:character`: 実Electronで普段着6表情、行動/交流、元アルファの透明部/脚の隙間、スケールを維持。テスト専用マッピングで同衣装neutralへの全状態fallback、欠損表情、事前読込で表示不変、失敗で旧画素/判定維持、同時切替、切替後も同衣装、普段着へ復帰、旧衣装キャッシュ解放を検証。**このテスト画像は部屋着本番PNGの代用として登録しない。**
- `npm run test:settings`: 実設定画面で候補移動の非反映、pending/不明IDと通常patch経由の拒否、日常Rendererの読込拒否時の選択維持、成功応答、衣装選択で専用が開かないことを検証。再起動前の保存を未準備loungewearへ変更し、defaultへの復旧と他設定維持も確認。
- `npm run test:memory`, `test:smoke`, `test:private-mode`, `test:events`, `test:styles`: 保存/初期化、入力・トレイ、専用の許可境界、イベント、開発/本番CSSを回帰確認。結果はPR本文にも記録。専用モードのローカル初回検証ではネイティブフォーカス競合が発生したため、テストの各入場時に設定へ明示フォーカスし、専用窓にも表示直後にフォーカスしてから検証する準備へ修正。本番のblur自動非表示条件は変更していない。修正後は3プロセスとも成功。

### macOSのメモリ測定

Apple Siliconの実Electronで、別Rendererを空の検証ページから起動し、実PNG6表情を順に表示して `app.getAppMetrics()` を採取。OS値はKiB、アルファはbyte。自然な回収待ちや強制GCは行っていないため、定常時の厳密な比較ではない。

| 測定 | 読込前working set | 6表情後working set | peak | JSが保持するalpha |
| --- | ---: | ---: | ---: | ---: |
| 上限制御前の6フレームcache | 79,312 KiB | 809,968 KiB | 927,520 KiB | 72,263,442 byte |
| 直近2フレーム＋128行ごとalpha抽出 | 78,256 KiB | 779,680 KiB | 909,344 KiB | 19,235,721 byte |

PNGは再圧縮/縮小せず、クリック判定も元解像度を維持。衣装切替時は旧衣装cacheを破棄し、全体でも直近2フレームまで。4K RGBAを丸ごと追加保持せず128行ずつalphaを抽出する。**OS側は依然約761 MiBで重い。** デコード画像・Canvas・ブラウザcache・GC待ちなどを含むため、alpha削減をプロセスメモリ解消と扱わない。配布前に長時間常駐/衣装切替の計測と、表示用解像度/画像デコード方式の改善検討が必要。

## 未実施・引き渡し

採用済み3枚を受領後、PNG寸法/RGBA/透明境界/ハッシュを確認し、マスターファイルは維持する。静的URL表へ受領ファイルを追加し、manifestのloungewearをreadyにしてidle/neutral・idle/shy・idle/affectionateを登録する。行動/表情ロジックのコピーは不要。neutralだけが正式受領済みなら、その1枚だけで最小切替を成立させ、追加表情は同衣装neutralへフォールバックできる。

部屋着3PNGの実表示、表情ごとの微細な揺れ、透過境界、実マウスのクリック/ドラッグ、Retina/外部画面、Windows実機は未確認。実素材での適用→自動保存→再起動復元も未確認。手動では `npm run dev` → 設定 → 候補移動では不変 → 適用 → 表情/交流/停止/非表示 → 再起動を確認する。採用素材がない間は「準備中」表示と普段着維持を確認する。

### Self-review

IssueのD7優先契約、画像未受領時の禁止事項、一般/専用分離、旧セーブ互換、失敗時の以前の衣装維持を照合。未受領PNGのimport/架空manifest登録、不採用trialの流用がないことを確認。実素材の受け入れ条件を達成したとは扱わず、PRはDraft・Issueは未完了で残す。self-reviewで、明示outfitIdを持つ直前フレームから別衣装へ切り替える場合にも新しい指定が優先されるよう修正し、回帰検証へ追加。新規依存なし。
