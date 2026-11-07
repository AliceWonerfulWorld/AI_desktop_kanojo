# MVP-04 自律行動エンジンの実装と検証

> この文書はMVP-04時点の記録。MVP-05以降の時間帯別選択・初期行動・睡眠継続・復帰通知は [時間帯検証記録](18-time-policy-validation.md) を参照。

## 実装範囲

`src/behavior/behavior-engine.ts` は DOM / Electron / PNG / セリフ本文を参照しない。共通の `Action` を使い、時計・単発タイマー・乱数を注入する。起動時は idle から始め、その継続時間が満了すると次の行動へ遷移する。クリック操作を待たず動作する。

| 行動 | 継続時間 | 暫定重み | 描画側の既定表情 |
| --- | --- | --- | --- |
| idle | 20〜60秒 | 35 | neutral |
| reading | 60〜180秒 | 25 | neutral |
| resting | 30〜120秒 | 30 | smile |
| sleeping | 120〜300秒 | 10 | sleepy |

時間は範囲内の一様乱数。遷移時は直前と同じ行動を候補から除き、残った正の重みを正規化して選択する。重みの合計100は必須ではない。継続時間と次の行動の選択には、それぞれ乱数を1回使用する。

**この段階では時刻帯による重み変更は未実装。** 暫定重みは仕様書の朝の値を固定利用する。深夜の睡眠継続例外、ローカル時刻変更・OSスリープ復帰時の時刻帯再評価は #5。会話本文・クリック交流は #6、永続化と再起動復元は #8。専用の行動画像・アニメーションも制作していない。現在は既存 PNG と表情差分へフォールバックする。新規依存・素材追加なし。

長い睡眠を含むため、実時間5分で必ず複数遷移することは保証しない。

## タイマーとライフサイクル

- `start()` は停止状態から新しい idle を開始。実行中・一時停止中の重複呼出しは何もしない。
- `pause()` は残り時間を保持して予約を取り消す。`resume()` はその残り時間を継続し、行動・sequence は変えない。繰り返し呼出してもタイマーは増えない。
- `stop()` は予約と現在状態をクリア。次の `start()` は idle から始める。sequence は同じエンジン内で単調増加する。
- `dispose()` は予約と購読を解放し、再起動不可にする。Renderer の pagehide でも実行する。
- 通常時計は `performance.now()` の単調時間を使う。これは UTC の保存時刻ではない。
- 単発タイマーは常に最大1個。キャンセル済み・遅れて届いたコールバックは世代番号で無効化する。
- 期限より早いコールバックは残り時間で再予約。遅れたコールバックは「現在時点から次の1行動」へ進み、過去の遷移を大量再生しない。
- 非表示でもエンジンを明示停止しない。Renderer / OS のタイマー抑制で遅延した場合も、復帰時に連続通知を大量発火しない。OSスリープ復帰イベントそのものの統合は未実施。
- 不正な期間・重み・乱数を拒否。実行中に乱数が不正になった場合は停止してエラー通知する。購読側の例外は他の購読やタイマー管理を壊さない。

snapshot は `status / current / remainingMs`。current は `action / sequence / startedAtMs / durationMs / deadlineMs`。一時停止中は残り時間が減らず、再開時に deadlineMs が延長されるため、deadlineMs−startedAtMs は一時停止時間を含み得る。durationMs は能動的に継続する時間で、両者を混同しない。

## 描画・会話・アニメーションへの通知

`subscribe()` は started / transition / paused / resumed / stopped を通知し、previous と凍結された snapshot を渡す。具体的なセリフや小春の性格は行動ルールに埋め込まない。

描画への接続は `src/renderer/src/behavior/runtime.ts`。開始・遷移通知を `CharacterRenderer.setState()` に変換し、表情の選択もこの描画側で行う。読書と待機の PNG が同じでも、意味上の action は別の状態として通知される。

アプリの組立部分は通知を `character-behavior` CustomEvent として Renderer 内へ発行する。将来の会話・アニメーション実装はこの意味通知を購読できる。現時点で吹き出し本文やアニメーションエンジンを実装したという意味ではない。

## 開発確認

`npm run dev` → トレイから開発者ツール → Renderer Console。

```js
behaviorPreview.getState()
addEventListener('character-behavior', (event) => console.log(event.detail))
behaviorPreview.pause()
behaviorPreview.getState() // paused、残り時間は固定
behaviorPreview.resume()
behaviorPreview.stop()
behaviorPreview.start() // 新たな idle
```

`behaviorPreview` は開発時だけ提供し、本番ビルドには存在しない。固定の操作 UI は追加しない。画像だけを手動で確認する場合は先に `behaviorPreview.pause()` してから `characterPreview.setState(...)` を使う。自律動作中は次の行動遷移でエンジンの表示へ戻る。

## 自動検証結果（ローカル macOS）

- `npm run check`: ESLint / Prettier / 単体テスト20件 / 型チェック / ビルド成功。
- 行動エンジン用10件は UI なしで実行。固定乱数・模擬時計で `idle(20秒) → reading(60秒) → resting(75秒) → sleeping(210秒)` を再現。
- 重み境界、24時間の模擬運転、継続時間範囲、連続抑制、予約最大1個、start/pause/resume の冪等性、stop/restart/dispose、古いコールバック、早期/遅延通知、購読側例外、不正入力、snapshot の保護を検証。
- `npm run test:smoke`: 本番 Renderer が自律行動を開始し、開発 API が存在しないことを確認。既存の PNG 透明部・ドラッグ・右クリック・トレイ・最前面・位置復旧・終了も成功。
- `npm run test:character`: Electron の実 PNG レンダラーへ模擬遷移を接続。行動4種、通常/笑顔/眠そうの実描画、通知、pause/resume/dispose 後の予約数を検証。既存の画像欠損・透過・解放の検証も成功。

CI でも macOS / Windows に同じ check・smoke・character テストを実行する。実時間の長時間観察や、実機のスリープ・外部ディスプレイ・別アプリへのクリック到達を証明する検証ではない。

## 手動確認（未実施）

1. `npm run dev` で操作せず待つ。初回 idle は20〜60秒、その後の表情や Console の通知が更新されることを確認。reading と idle は同じ表情なので通知の action も見る。
2. Console で pause を2回呼び、remainingMs が減らないことを確認。resume を2回呼び、残り時間を経て1回だけ遷移することを確認。
3. stop 中に状態遷移がなく、start で idle から再開することを確認。
4. 自律動作中もドラッグ、右クリック、最前面切替、非表示/表示、位置リセット、終了ができることを確認。
5. 実機の長時間動作・非表示からの復帰・OSスリープ復帰は追加確認する。時刻帯による行動補正は #5 の実装後に確認する。

実時間5分の目視観察、OSスリープ復帰、Retina / 外部画面、Windows実機の手動確認は未実施として残す。
