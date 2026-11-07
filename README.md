# AI Desktop Kanojo

macOS（Apple Silicon）で先行開発し、将来 Windows にも対応するデスクトップ常駐アプリです。Electron + Vite + TypeScript を使い、透明な常駐ウィンドウ、トレイ操作、PNG画像差分の描画基盤を実装しています。

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

主画面右下にテスト用PNGが表示されます（正式な小春画像ではありません）。左ドラッグで移動、右クリックまたはトレイから表示/非表示・最前面・クリック透過・位置リセット・終了を操作できます。トレイは Windows の隠れているインジケーターに入る場合があります。

透明領域のクリック透過は試験機能です。キャラの操作が戻らない場合は、トレイから透過を OFF にするか非表示にしてください。[検証結果・制限・Windows 手動確認手順](docs/13-desktop-window-validation.md) を参照してください。

設定はセッション内で保持します。専用設定画面は #9、位置や設定の再起動後の復元は #8 で対応します。ウィンドウを閉じると非表示になり、トレイの「終了」でプロセスを終了できます。同時起動は既存ウィンドウを再表示します。

Renderer の変更は HMR で反映されます。Main / Preload の変更が反映されない場合は、トレイから終了して再起動してください。

```powershell
npm run check
npm run test:smoke
npm run test:character
npm run start
```

`check` は ESLint・Prettier・境界テスト・型チェック・ビルドを実行します。`start` はビルド済みのアプリを起動します。生成先は `out/` です。インストーラーや配布用 exe は [Issue #10](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/10) で対応します。

開発時の表情・行動切替は [描画検証記録](docs/15-character-renderer-validation.md) の Console 手順を使用します。本番の固定操作UIは追加しません。素材の出典・権利・制作状態は [素材台帳](assets/character/manifest.md) に記録しています。

## コマンド

| コマンド                 | 用途                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `npm run dev`            | 開発サーバーと Electron を起動                                 |
| `npm run build`          | 型チェックと全プロセスのビルド                                 |
| `npm run start`          | ビルド済みアプリを起動                                         |
| `npm run typecheck`      | Main / Preload と Renderer を別々に型チェック                  |
| `npm test`               | 作業領域と複数画面の境界テスト                                 |
| `npm run test:smoke`     | ビルド後の Electron で分離設定・入力制御・トレイ処理を自動検証 |
| `npm run test:character` | Electronで差分・フォールバック・拡大判定・解放を検証           |
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

`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true` を維持します。Renderer は Node.js / Electron を直接 import せず、型付きの `window.desktop` を利用します。バージョン情報と、入力領域・ドラッグ開始/終了・メニュー表示のみ公開します。Main は送信元と引数を検証し、座標を Renderer から受け取りません。

追加ウィンドウ・ページ遷移を拒否し、CSP でスクリプトの読込元を制限します。WebSocket の localhost 許可は HMR 用です。[技術設計](docs/03-architecture.md) と [ロードマップ](docs/05-roadmap.md) も参照してください。

## エラー調査

- Renderer: トレイまたは右クリックの「開発者ツール」から Console / Network を確認。透明表示を検証できるよう、DevTools は自動では開きません。
- Main / Preload: 起動元ターミナルを確認。Preload の失敗と Renderer 終了も出力します。
- キャラが表示されない: トレイから「主画面の右下に戻す」。改善しなければ Console と `out/preload/index.js` の生成を確認し、ビルドし直してください。
- `npm ci` が失敗: Node バージョン・プロキシ・Electron バイナリのダウンロード制限を確認。lockfile は削除せずに再試行します。

CI は Windows / macOS で `npm ci` → `npm run check` → `npm run test:smoke` → `npm run test:character` を実行します。実マウス・混在 DPI・ディスプレイの抜き差しは別途、検証記録の手順で確認してください。smoke と通常アプリは単一インスタンス制御で干渉するため、実行前にアプリを終了してください。

Electron 42 以降の遅延ダウンロードに対応するため、`postinstall` で公式の `install-electron` を呼びます（[公式変更点](https://www.electronjs.org/blog/electron-42-0)）。`--ignore-scripts` を使う場合は、起動前に `npm exec -- install-electron` を実行してください。

開発ツールの minimatch は DoS 脆弱性 GHSA-g3hv-75wg-m249 の修正版 `^11.0.1` へ overrides で固定しています。依存更新時に指定の必要性を再確認してください。
