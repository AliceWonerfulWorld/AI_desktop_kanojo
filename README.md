# AI Desktop Kanojo

macOS（Apple Silicon）で先行開発し、将来 Windows にも対応するデスクトップ常駐アプリです。Electron + Vite + TypeScript を使い、透明な常駐ウィンドウ、トレイ操作、PNG画像差分と自律行動エンジンを実装しています。

## 開発環境

- Git、Node.js **22.22.2** と付属の npm（`.nvmrc` に固定）
- macOS のターミナル。Windows Terminal / PowerShell でも同じ npm コマンドを利用可能

```powershell
git clone https://github.com/AliceWonerfulWorld/AI_desktop_kanojo.git
cd AI_desktop_kanojo
node --version
npm ci
npm run dev
```

主画面右下にユーザー選定の小春の透過PNGが表示されます。通常・笑顔・照れ・眠そう・驚き・甘えの6表情を使い、行動専用ポーズは小春画像で代替します。幾何図形のテスト素材は通常表示しません。左ドラッグで移動、右クリックまたはトレイから表示/非表示・最前面・クリック透過・位置リセット・終了を操作できます。トレイは Windows の隠れているインジケーターに入る場合があります。

小春画像の公開・商用・成人向け配布条件は未確認で、リリース可能とは扱っていません。[素材台帳](assets/character/koharu/manifest.md) と [6表情の検証・手動確認手順](docs/24-smile-integration-validation.md) を参照してください。

透明領域のクリック透過は試験機能です。キャラの操作が戻らない場合は、トレイから透過を OFF にするか非表示にしてください。[検証結果・制限・Windows 手動確認手順](docs/13-desktop-window-validation.md) を参照してください。

起動後は待機・読書・休憩・睡眠を自律的に切り替えます。継続時間は20〜300秒の範囲で、専用画像がない行動は既存PNGへ代替表示します。実時間5分で複数遷移する保証はありません。端末の現地時刻で朝・昼・夜・深夜の行動重みを変え、深夜のみ睡眠継続を許可します。起動時には初回判定と時間帯に応じた挨拶が約5秒表示されます。

初回判定は userData 内の空の `welcome-seen.marker` を引き継ぎます。生活記憶は同じ保存先のバージョン付き `memory.json` に保存し、未起動やスリープの時間を累計稼働時間へ加算しません。時計変更は次回選択から反映し、進行中の行動は中断しません。

親密度・交流回数・最終起動日時・実稼働時間・最後の行動・位置と設定を終了後も復元します。トレイ/右クリックの「設定…」で最前面、サイズ50〜200%、自発的な挨拶、起動時表示、一時停止を変更できます。非表示でもトレイから戻せます。挨拶OFFでもクリックには返事し、一時停止中は動きと反応を止めます。[設定・確認手順](docs/23-settings-validation.md)を参照してください。

保存行動は新しい継続時間で再開し、昼間の睡眠は現在時刻で選び直します。トレイの「生活記憶・設定を初期化…」で確認後にデータを消去できます。ウィンドウを閉じると非表示になり、トレイの「終了」で保存して終了します。同時起動は既存ウィンドウを再表示します。[保存・復旧・確認方法](docs/22-memory-validation.md)を参照してください。

Renderer の変更は HMR で反映されます。Main / Preload の変更が反映されない場合は、トレイから終了して再起動してください。

```powershell
npm run check
npm run test:smoke
npm run test:character
npm run start
```

`check` は ESLint・Prettier・境界テスト・型チェック・ビルドを実行します。`start` はビルド済みのアプリを起動します。生成先は `out/` です。インストーラーや配布用 exe は [Issue #10](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/10) で対応します。

開発時の表情・行動切替は [描画検証記録](docs/15-character-renderer-validation.md) の Console 手順を使用します。本番の固定操作UIは追加しません。素材の出典・権利・制作状態は [素材台帳](assets/character/manifest.md) に記録しています。

自律動作の通知・一時停止・再開の確認は [行動エンジン検証記録](docs/17-behavior-engine-validation.md) を参照してください。画像だけの手動切替前には `behaviorPreview.pause()` で自律遷移を一時停止します。

時間帯・挨拶の確認には開発用 `timePreview.setLocalTime(...)` を使用できます。OS時計は変更しません。[模擬時刻の手順・スリープ復帰・未確認事項](docs/18-time-policy-validation.md) を参照してください。

キャラの有効画素上の短い左クリックで、行動と関係段階に合うセリフ・一時表情を表示します。ドラッグ終了・透明部・右クリックは交流扱いにしません。反応は約3秒、受付間隔は通常3秒・睡眠中15秒です。親密度は60秒に1回まで1点増え、30/70で照れ・控えめな甘えへ変化します。未起動の減点はなく、加算待ち時間も再起動後に保持します。[クリック操作](docs/19-interaction-validation.md) と [保存を含む確認手順](docs/22-memory-validation.md) を参照してください。

## コマンド

| コマンド                 | 用途                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `npm run dev`            | 開発サーバーと Electron を起動                                 |
| `npm run build`          | 型チェックと全プロセスのビルド                                 |
| `npm run start`          | ビルド済みアプリを起動                                         |
| `npm run typecheck`      | Main / Preload と Renderer を別々に型チェック                  |
| `npm test`               | 作業領域と複数画面の境界テスト                                 |
| `npm run test:smoke`     | ビルド後の Electron で分離設定・入力制御・トレイ処理を自動検証 |
| `npm run test:memory`    | 一時保存先で実Electronの終了・再起動・復元・初期化を検証       |
| `npm run test:settings`  | 設定UI・サイズ・一時停止・非表示起動と再起動復元を検証         |
| `npm run test:character` | Electronで差分・フォールバック・拡大判定・解放を検証           |
| `npm run test:styles`    | 開発/本番のCSS、開発用の親密度確認と段階別挨拶を検証           |
| `npm run assets:test`    | 自作テストPNGを再生成（通常起動では不要）                      |
| `npm run lint`           | ESLint                                                         |
| `npm run format`         | Prettier で整形                                                |
| `npm run format:check`   | 整形の検証                                                     |
| `npm run check`          | CI と同じ静的検証・テスト・ビルド                              |

## 構成とセキュリティ

```text
src/main/       Electron のウィンドウ、トレイ、入力・位置制御
src/preload/    contextBridge による最小限の公開 API
src/renderer/   HTML / CSS / TypeScript の UI
src/shared/     プロセス間で共有する型と IPC チャンネル
```

`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true` を維持します。Renderer は Node.js / Electron を直接 import せず、型付きの `window.desktop` を利用します。バージョン情報、初回判定の読取、限定したスリープ通知、入力領域・ドラッグ開始/終了・メニュー表示を公開します。Main は送信元と引数を検証し、座標を Renderer から受け取りません。

追加ウィンドウ・ページ遷移を拒否し、CSP でスクリプトの読込元を制限します。WebSocket の localhost 許可は HMR 用です。[技術設計](docs/03-architecture.md) と [ロードマップ](docs/05-roadmap.md) も参照してください。

## エラー調査

- Renderer: トレイまたは右クリックの「開発者ツール」から Console / Network を確認。透明表示を検証できるよう、DevTools は自動では開きません。
- Main / Preload: 起動元ターミナルを確認。Preload の失敗と Renderer 終了も出力します。
- キャラが表示されない: トレイから「主画面の右下に戻す」。改善しなければ Console と `out/preload/index.js` の生成を確認し、ビルドし直してください。
- `npm ci` が失敗: Node バージョン・プロキシ・Electron バイナリのダウンロード制限を確認。lockfile は削除せずに再試行します。

CI は Windows / macOS で `npm ci`、`npm run check`、`test:styles`、`test:smoke`、`test:character`、`test:memory`、`test:settings` を実行します。再起動・初期化テストは一時保存先を使います。実マウス・実OSスリープ・混在 DPI・ディスプレイの抜き差しは別途、検証記録の手順で確認してください。

Electron 42 以降の遅延ダウンロードに対応するため、`postinstall` で公式の `install-electron` を呼びます（[公式変更点](https://www.electronjs.org/blog/electron-42-0)）。`--ignore-scripts` を使う場合は、起動前に `npm exec -- install-electron` を実行してください。

開発ツールの minimatch は DoS 脆弱性 GHSA-g3hv-75wg-m249 の修正版 `^11.0.1` へ overrides で固定しています。依存更新時に指定の必要性を再確認してください。

### 専用モードの切替（Issue #29）

設定画面の「成人向け専用モードの確認へ…」から、18歳以上の自己申告と明示操作で専用画面を開けます。現在は全年齢のダミー画面のみで、イベント/CGは未実装です。Esc・戻るで元の日常状態へ戻り、非表示ならトレイから通常表示へ戻せます。

「フォーカスを失ったら専用画面を隠す」は初期ON。OFFでも進行は一時停止し、明示再開を必要とします。OSスリープ・終了・再起動では専用状態を解除し、自動再表示しません。保存するのはこの表示設定だけで、自己申告や専用への入場許可は保存しません。[仕様・検証・実機未確認事項](docs/26-private-mode-validation.md) を参照してください。`npm run test:private-mode` で一時保存先を使った統合テストを実行できます。

## 衣装（Issue #37・素材受領待ち）

既存の設定画面へ衣装欄を追加。候補を選んだだけでは変わらず「この衣装を適用」で読み込み確認後に反映・自動保存します。現在は普段着6表情のみ、採用済み部屋着PNGは未受領のため「素材準備中」で選択不可です。不採用trialは使いません。衣装選択は成人向け専用モードと独立しています。[実装範囲・検証・残課題](docs/28-outfit-registry-validation.md)。
