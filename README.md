# AI Desktop Kanojo

Windows 向けデスクトップ常駐アプリの開発リポジトリです。現在は Electron + Vite + TypeScript の開発土台を実装しています。

## 開発環境（Windows）

- Git
- Node.js **22.22.2** と付属の npm（`.nvmrc` にバージョンを固定）
- PowerShell または Windows Terminal

```powershell
git clone https://github.com/AliceWonerfulWorld/AI_desktop_kanojo.git
cd AI_desktop_kanojo
node --version
npm ci
npm run dev
```

起動ウィンドウに接続確認メッセージと Electron / Chrome / Node のバージョンが表示されれば成功です。開発時は DevTools が別ウィンドウで開きます。Renderer の変更は Vite の HMR で反映されます。Main / Preload の変更が反映されない場合は、ターミナルで Ctrl+C を押して再起動してください。

```powershell
npm run check
npm run test:smoke
npm run start
```

`check` は ESLint・Prettier・型チェック・ビルドを実行します。`start` はビルド済みのアプリを起動します。`npm run build` 単独でも型チェックとビルドができます。生成先は `out/` です。インストーラーや exe の配布パッケージ生成は [Issue #10](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues/10) で対応します。

macOS でも同じ npm コマンドを利用できます。macOS ではウィンドウを閉じてもアプリは終了しないため、メニューから終了してください。

## コマンド

| コマンド               | 用途                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `npm run dev`          | 開発サーバーと Electron を起動                                 |
| `npm run build`        | 型チェックと全プロセスのビルド                                 |
| `npm run start`        | ビルドしたアプリを起動（先に build が必要）                    |
| `npm run typecheck`    | Main / Preload と Renderer を別々に型チェック                  |
| `npm run lint`         | ESLint                                                         |
| `npm run format`       | Prettier で整形                                                |
| `npm run format:check` | 整形の検証                                                     |
| `npm run test:smoke`   | ビルド後の Electron を起動し、Preload 接続と分離設定を自動検証 |
| `npm run check`        | CI と同じ静的検証・ビルド                                      |

## 構成とセキュリティ

```text
src/main/       Electron のウィンドウとライフサイクル
src/preload/    contextBridge による最小限の公開 API
src/renderer/   HTML / CSS / TypeScript の UI
src/shared/     プロセス間で共有する型
```

`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true` を維持します。Renderer は Node.js / Electron を直接 import せず、型付きの `window.desktop` のみ利用します。現在公開しているのはバージョン情報の読み取りだけです。追加ウィンドウ・ページ遷移を拒否し、CSP でスクリプトの読込元を制限しています。WebSocket の localhost 許可は開発時の HMR 用です。

設計方針は [技術設計](docs/03-architecture.md)、実装順は [ロードマップ](docs/05-roadmap.md) を参照してください。

## エラー調査

- Renderer のエラー: DevTools の Console / Network を確認します。ビルド後も View → Toggle Developer Tools（Windows: Ctrl+Shift+I、macOS: Option+Command+I）で開けます。
- Main / Preload の起動失敗: 起動元ターミナルを確認します。Preload の失敗と Renderer プロセス終了も出力されます。
- 初期画面で接続確認が失敗: Console のエラーと `out/preload/index.js` の生成を確認し、ビルドし直してください。
- `npm ci` が失敗: Node バージョン・プロキシ・Electron バイナリのダウンロード制限を確認してください。lockfile は削除せずに再試行します。

CI では Windows / macOS の `npm ci`・`npm run check`・Electron の自動起動検証 を実行します。GUI 起動確認は各 OS 上で上記の手順を実行してください。

Electron 42 以降の遅延ダウンロードに対応するため、`postinstall` で公式の `install-electron` を呼び出しています（[公式変更点](https://www.electronjs.org/blog/electron-42-0)）。これにより `npm ci` 後に electron-vite から起動できます。`--ignore-scripts` を利用する場合は、起動前に `npm exec -- install-electron` を実行してください。

開発ツールが間接参照する minimatch は、DoS 脆弱性 GHSA-g3hv-75wg-m249 の修正版 `^11.0.1` へ overrides で固定しています。依存更新時はこの指定の必要性を再確認してください。
