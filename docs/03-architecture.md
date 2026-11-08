# 技術設計（初期案）

> 2026-11-08 / Issue #13: 現在はPNG＋日常生活＋親密度＋イベントを優先し、Live2D #15/#16/#23/#25は一時保留。下記の導入順は再開時の技術計画であり、イベント実装の前提ではない。UIは[D1/D5/D6/D10承認済み・その他は最終確認待ち](25-ui-interaction-design.md)で、今回コードや保存スキーマは変更しない。

> MVP-09: 専用設定ウィンドウ/Preloadを追加。Mainで設定パッチを検証し、revision付き表示状態を両画面へ通知する。Rendererは非表示/停止/OSスリープを合成して進行を制御する。[仕様・検証](23-settings-validation.md)。

> MVP-08実装: 保存スキーマの正本は `src/shared/memory-state.ts`。Mainの `MemorySession` が稼働時間・交流・設定を所有し、`MemoryStore` が検証・一時ファイル置換・バックアップ復旧を担う。以下の初期状態モデル案と区別する。[保存と検証](22-memory-validation.md) を参照。

> 技術選定は暫定。最初の技術検証で変更可能。

## 1. 技術スタック
| 領域 | 候補 |
| --- | --- |
| デスクトップ基盤 | Electron |
| 言語 | TypeScript |
| UI | HTML / CSS（必要に応じて軽量UIライブラリ） |
| ビルド | Vite / electron-vite 等を比較して決定 |
| 2D表示 | 透過PNG差分 + CSSアニメーション |
| データ保存 | JSON / electron-store 等 |
| 配布 | Windows向け portable または installer |
| 将来検討 | Live2D / 音声 / AI会話 |

## 2. レイヤー構成

```text
Electron Main
├── BrowserWindow / Tray / settings IPC
├── local persistence
└── platform behaviors
       ↑ limited IPC
Preload (contextBridge)
       ↑ typed API
Renderer
├── 2D Character View
├── Dialogue Bubble
├── Settings UI
└── Application State
    ├── BehaviorEngine
    ├── TimePolicy
    ├── RelationshipPolicy
    └── Memory
```

### セキュリティ方針
- `nodeIntegration: false`
- `contextIsolation: true`
- preloadで公開するAPIは最小限
- 任意のファイルパスをRendererから受け取らない
- 外部コンテンツの無制限な読み込みを避ける
- CSP・依存パッケージの脆弱性を確認する

## 3. 状態モデル案
```ts
type Action = "idle" | "reading" | "resting" | "sleeping";
type Expression = "neutral" | "smile" | "sleepy" | "surprised" | "shy" | "affectionate";
type RelationshipStage = "stranger" | "familiar" | "close";

interface CharacterState {
  action: Action;
  expression: Expression;
  affection: number; // 0..100
  relationshipStage: RelationshipStage;
  actionStartedAt: string;
}

interface PersistedState {
  schemaVersion: number;
  character: CharacterState;
  lastLaunchedAt: string | null;
  totalActiveMinutes: number;
  interactionCount: number;
  settings: {
    alwaysOnTop: boolean;
    scale: number;
    spontaneousDialogue: boolean;
    windowBounds: { x: number; y: number; width: number; height: number } | null;
  };
}
```

## 4. データフロー
1. Mainが前回のセーブと設定を読み込む。
2. RendererでBehaviorEngineを初期化し、時刻から行動候補を選ぶ。
3. UIは状態を描画するだけ（行動選択ロジックはUIから分離）。
4. ユーザーがクリックすると交流イベントが発火。
5. 状態更新を適切に間引いて保存。終了時にも保存を試みる。
6. 再起動時、前回のデータを復元し、現在時刻に合った行動へ補正する。

## 5. 実装上のリスク
- 透明領域を「背景には透過、キャラクターには反応」にするヒットテスト
- DPI・マルチモニター・画面外への移動
- 高頻度更新によるCPU/メモリ負荷
- Electronの常時最前面が他アプリの操作を妨害する可能性
- フレーム画像やLive2Dなど素材制作の工数

まずは仮のPNG 1枚でElectron上の透明・ドラッグ・クリック透過を検証し、成立を確認してから行動エンジンに進む。

## 6. 描画差し替え設計（Live2Dを見据える）
- BehaviorEngine は `Action`, `Expression` の意味状態を通知し、特定レンダラーのAPIを直接呼ばない。
- PNG版で先にMVPを完成し、#15でCubism表示を検証、成功したら#16でLive2Dアダプターを統合する。
- 描画方式とセーブ形式を分離する。Cubism SDK・商用モデルのライセンス確認なしに配布しない。
- 詳細: [docs/09-live2d-plan.md](09-live2d-plan.md)。

## 7. 透明常駐ウィンドウ（MVP-02）
- Main の `desktop-window.ts` がトレイ、最前面切替、ドラッグ、画面内補正を所有する。
- 作業領域とカーソル座標は DIP で統一し、ディスプレイ変更時に位置を補正する。
- 透過はマウス移動転送と Renderer の形状判定を利用する試験機能。トレイから無効化できる。
- 実装範囲・実機未確認事項は [検証記録](13-desktop-window-validation.md) を参照。

## 8. PNG差分描画（MVP-03）
- `src/shared/character-state.ts` が行動・表情の意味型を定義する。通常表情のコードIDは neutral。
- `CharacterRenderer` の setState / hitTest / dispose 経由で状態更新と入力判定を行う。
- PNG実装は素材台帳の状態マッピングとフォールバック、元画像のアルファ判定を所有する。
- 実装範囲・検証・Live2Dへの交換境界は [MVP-03 検証記録](15-character-renderer-validation.md) を参照。
- Issue #22で通常素材を小春5表情へ移行。テスト素材のmanifest/importは別に分離し、通常ランタイムから参照しない。元画素のalphaだけをヒットマスクとして保持する。[統合検証](21-koharu-integration-validation.md) を参照。

## 9. 自律行動エンジン（MVP-04）
- `src/behavior/behavior-engine.ts` は Electron / DOM / PNG / 会話文から独立し、時計と乱数を注入して動作する。
- 予約は単発1個に限定し、停止・一時停止・再開・解放で古いコールバックを無効化する。
- Renderer の `behavior/runtime.ts` が意味上の行動通知を共通描画APIへ変換する。会話・アニメーション用には `character-behavior` 通知を提供する。
- 経過時間は単調時計。保存用UTC・時刻帯ポリシーとは分離し、時刻帯対応は #5 へ残す。
- 詳細は [自律行動検証記録](17-behavior-engine-validation.md) を参照。

## 10. 時間帯と挨拶（MVP-05）
- `time-policy.ts` は現地時刻から時間帯別重みを返す。BehaviorEngine は選択時にポリシーを再取得し、継続時間は引き続き単調時計で扱う。
- 起動挨拶は会話/描画側に分離。Main の空の初回マーカーだけを読み、交流時間や未起動時間を推定しない。
- Main の powerMonitor 通知を最小限の Preload API で配信し、Renderer が一時停止・復帰を管理する。
- スリープ通知の限界と模擬時刻テストは [時間帯検証記録](18-time-policy-validation.md) を参照。

## 11. クリック交流（MVP-06）
- `PointerGesture` が真のクリックを判別し、Main の finishDrag 分類で実移動も確認する。
- `responses.ts` が行動別の短い応答を所有し、`InteractionRenderer` が共通描画APIに一時表情を重ねる。行動エンジンとは独立。
- 受け付けた交流だけを character-interaction で通知し、親密度の保存や増加はまだ行わない。
- 受付間隔、復元、破棄と入力検証は [クリック交流検証記録](19-interaction-validation.md) を参照。

## 12. 親密度（MVP-07）

- `src/relationship/relationship.ts` は親密度・段階・加算間隔を管理する。単調時計を注入し、DOM/描画/会話文に依存しない。
- Rendererが受け付けた交流通知でのみ加算する。会話側は段階を取得して反応を選び、行動エンジンは変更しない。
- 保存は #8。開発用確認APIはDEV条件の動的import内に限定する。[仕様と検証](20-relationship-validation.md) を参照。
