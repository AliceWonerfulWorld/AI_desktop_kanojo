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
type Expression = "neutral" | "smile" | "sleepy" | "surprised";
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
