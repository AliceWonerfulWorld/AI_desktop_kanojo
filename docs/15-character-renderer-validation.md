# MVP-03 画像差分とアルファ判定の検証

## 実装範囲

行動は `idle / reading / resting / sleeping`、表情は `neutral / smile / sleepy / surprised / shy / affectionate`。型の正本は `src/shared/character-state.ts`。デザイン資料の通常表情 `normal` は `neutral` に対応する。

`CharacterRenderer` の `setState / hitTest / dispose` を描画の境界にする。状態選択や入力制御は画像 DOM を操作せず、この API を利用する。PNG 実装は画像を canvas に描画するが、将来の Live2D 実装にも意味状態の型と入力 API を維持できる。自律状態遷移・時刻連動・交流・関係性は未実装で、後続 Issue の範囲。

配置済みなのは自作の幾何図形による4表情の PNG テスト素材のみ。正式な小春画像・PSD・Live2D モデルは追加していない。画像生成モデルは使っていない。コード作成支援に Codex を利用。素材・生成スクリプトの MIT 条件と配置状態は [素材台帳](../assets/character/manifest.md) と `manifest.json` に記録する。新規依存なし。

## マッピングとフォールバック

manifest を元に、次の優先順で候補を選ぶ。

1. 行動×表情が完全一致する素材
2. 同じ表情の idle 素材
3. 同じ行動の neutral 素材
4. idle/neutral

候補が重複した場合は1回だけ試す。読み込めない候補を飛ばし、次の画像を試す。候補が全滅したら表示とヒットマスクを空にして、トレイの復旧導線を残す。読込失敗はレンダラーの生存中キャッシュするため、ファイルを修正したら開発ウィンドウを再読込する。

返り値は要求状態・実際の素材ID・代替使用の有無・読込不能ID・適用結果。代替しても要求された意味状態は変更しない。`reading/smile` は現在 `test-smile`、`sleeping/shy` は `test-neutral` を表示し、`fallback: true` になる。画面外の読み上げ用ステータスにも代替使用を記録する。

状態を連続変更すると、最後のリクエストだけが適用される。読込中の解放も適用を中止する。`dispose()` は canvas・ResizeObserver・resize listener・画像/アルファキャッシュを解放する。

## 透明 PNG のヒット判定

`<img>` の矩形や `elementFromPoint()` は PNG のアルファを判定しないため、旧 SVG の `[data-hit]` 判定を廃止した。

- ローカル PNG の読込時に元画像の RGBA を一度取得してキャッシュする。透明画素（alpha=0）は常に非ヒット。alpha>0 の画素をヒットとする。
- 描画と判定は共通のアスペクト比維持・下寄せ座標変換を使う。余白と画像内部の透明な隙間を判別する。
- CSS 座標で判定し、canvas の描画解像度のみ devicePixelRatio を掛ける。拡大縮小や Retina で物理画素と CSS 座標を混用しない。
- マウス移動で判定を Main の既存 boolean IPC へ送る。状態変更時も最後に把握したカーソル位置を再判定する。
- 透過 OFF 時でも、透明画素ではドラッグやキャラメニューを開始しない。キャラ画素上の右クリックは既存 IPC でメニューを開く。
- OS への透過は引き続き Main の `setIgnoreMouseEvents`。Main / Preload の権限・公開 API は追加していない。

同一画像の RGBA は毎フレーム取得しない。常時のポーリングや描画ループも追加していない。画像は最大1600万画素、読込は候補あたり5秒で打ち切る。

制限: スムージング後の境界色を OS に直接判定させる方式ではなく、元画像の画素を参照する。輪郭付近の僅かな差と IPC 遅延は残る。別アプリへ実クリックが届くこと、Retina/外部画面間の操作感は OS 実機での確認が必要。[MVP-02 の制限と復旧方法](13-desktop-window-validation.md) も継続する。

## 開発中の状態切替

`npm run dev` で起動し、トレイの「開発者ツール」→ Renderer の Console から実行する。

```js
await characterPreview.setState({ action: 'idle', expression: 'smile' })
await characterPreview.setState({ action: 'reading', expression: 'sleepy' })
await characterPreview.setState({ action: 'sleeping', expression: 'shy' })
characterPreview.getState()
```

このオブジェクトは開発時だけ提供し、本番の `npm run build` / `npm run start` には存在しない。常駐画面に固定のテスト操作 UI は置かない。`normal` という入力は受け付けず `neutral` を使う。`getState()` はプレビューで最後に適用した結果を返す（最初のプレビュー操作前は undefined）。

## 自動検証（ローカル macOS）

- `npm run check`: ESLint / Prettier / 単体テスト10件 / 型チェック / ビルドに成功。
- `npm run test:smoke`: 本番ビルドを実 Electron で起動。透明余白 → 実画素 → PNG内部の隙間 → 実画素の復帰を Renderer のマウスイベントから Main の API 切替まで検証。透明部のドラッグ/メニュー抑制、キャラ上のメニュー発火、既存ドラッグ、最前面 OFF、透過 OFF、表示/非表示、位置リセット、close 後の復旧、終了に成功。
- `npm run test:character`: 分離した Electron Renderer で4表情の描画結果が異なること、6表情と各行動の切替、未制作/壊れた画像のフォールバック、全滅時の表示/ヒットのクリア、拡大時の透明隙間、並行更新、読込中の解放に成功。
- 本番に開発用プレビューがないことを smoke で確認。
- PNG の実ファイルをデコードし、出典台帳との整合と透明部分を単体テストで確認。

CI は macOS / Windows に同じ check・smoke・character 検証を実行する。smoke はネイティブメニューの表示をテスト内で捕捉し、ドラッグのカーソル座標を模擬する。別アプリへの実クリック到達や OS メニューの目視操作を証明するものではない。

## 手動確認（未実施）

1. macOS で `npm run dev`、仮 PNG が背景透明で表示されることを確認。
2. Console のプレビューで4表情を切替。shy/affectionate と各行動では返り値の代替表示を確認。
3. 画像矩形の角、両脚の間、キャラの実画素をクリック。透過 ON で透明部分から背後の安全な操作画面に入力が届き、実画素ではドラッグ/右クリックできることを確認。
4. 透過 OFF でも透明画素でドラッグやキャラメニューが始まらないこと、トレイの表示/非表示・最前面・位置復旧・終了が使えることを確認。
5. Retina / 外部ディスプレイ、サイズ補正後も輪郭と入力領域が一致することを確認。
6. `npm run build` → `npm run start` では Console にプレビュー操作が存在しないことを確認。

OS 越しの実クリックと外部ディスプレイの手動検証は未実施として残す。正式な小春素材の制作・配置完了とも区別する。
