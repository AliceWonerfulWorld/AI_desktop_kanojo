# 技術設計（初期案）

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
