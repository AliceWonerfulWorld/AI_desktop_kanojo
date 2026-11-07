# Codexへの実装指示 — 小春の実画像を既存描画システムに統合

> この文書は **Issue #3をやり直すための指示ではない**。MVP-03（#3）は完了済みで、PNGレンダラーとアルファ当たり判定は既に存在する。実画像が完成した後、既存構成への追加だけを行う。
> 素材未配置の段階では「準備待ち」と報告し、架空の画像や誤ったプレースホルダーを本番扱いしない。

## Codexへ渡す依頼（コピー用）

```text
リポジトリ AI_desktop_kanojo で、小春の実画像素材を既存PNGキャラクター描画機構へ統合してください。

先に以下を読み、既存実装を調査:
- AGENTS.md
- docs/14-koharu-master-design.md
- docs/15-codex-asset-integration.md
- docs/15-character-renderer-validation.md
- assets/character/koharu/manifest.md
- assets/character/manifest.json
- src/shared/character-state.ts
- src/renderer/src/character/assets.ts
- src/renderer/src/character/asset-selection.ts
- src/renderer/src/character/png-renderer.ts

# 前提
- Issue #3は完了済み。描画API・フォールバック・アルファヒットテストを再構築しない。
- 5枚の入力画像は元々 572x1024、WebP/RGB、白背景で透過していない。PNG拡張子へ変更するだけでは透明にならない。
- assets/character/manifest.json は既存の幾何テスト素材だけが配置済み。これらを本番の小春画像と誤認しない。
- normal -> neutral、shy -> shy、sleeping（眠そうな表情）-> sleepy、
  suprising（元ファイル名のtypo）-> surprised、sweet -> affectionate。
- appの型は neutral / smile / sleepy / surprised / shy / affectionate。
- macOS Apple Siliconでの検証を優先し、Windowsは実機未確認と記載。

# 作業
1. 5枚の実画像がリポジトリ又はローカルの明示された場所にあるか確認。
   なければ製品素材を勝手に生成せず「画像待ち」と報告する。
2. ランタイム登録前に各画像のアルファを検査。未透過なら既存の
   クリック透過を壊すため登録しない。背景除去・修正が必要と報告。
3. 使用権・公開可否が確認された実ファイルだけを
   assets/character/koharu/png/standing_<expression>.png に配置する。
4. 正しいファイルパスを assets/character/manifest.json に追加し、
   src/renderer/src/character/assets.ts に静的importとURLマッピングを追加。
   現在のテスト素材4枚は維持し、同一(action, expression)に複数候補が
   ある場合の優先順位を確認・テストする。必要なら最小限の選択規則を調整。
5. action='idle' に5つの表情を登録。
   smileは専用画像がまだ無いので安全にneutral等へフォールバック。
   sleepingは「眠そうな顔」のことで睡眠ポーズではない。
6. Alphaヒットテストと描画位置・サイズの整合、切替時の画像ジャンプ、
   白フリンジ、透過抜け、非表示/トレイからの復旧を検証。
7. 台帳を実際のファイル配置・生成AIの利用条件・確認結果に合わせて更新。
8. 実施したコマンドとテスト結果、未確認項目をPRで報告。

# 非対象
- Live2D SDK、Cubism PSD制作、AI画像生成、表情の再デザイン
- クリック会話 / 親密度 / 時刻連動の実装
- ライセンス未確認の画像を無条件で公開GitHubへ追加

# 完了条件
- 実在する5枚の透過PNGのみを正しく登録
- 既存の test/*.png も保持
- 全5表情を開発プレビューから確認できる
- 透明画素でドラッグ/クリックを誤検出しない
- npm run check、npm run test:smoke、npm run test:character が通る
- 不足・未実施の手動macOS検証を明記
```

## 画像とコードの対応表

| 原本WebP | 生成予定のPNG | expression | action |
| --- | --- | --- | --- |
| `koharu_normal.webp` | `koharu/png/standing_neutral.png` | `neutral` | `idle` |
| `koharu_shy.webp` | `koharu/png/standing_shy.png` | `shy` | `idle` |
| `koharu_sleeping.webp` | `koharu/png/standing_sleepy.png` | `sleepy` | `idle` |
| `koharu_suprising.webp` | `koharu/png/standing_surprised.png` | `surprised` | `idle` |
| `koharu_sweet.webp` | `koharu/png/standing_affectionate.png` | `affectionate` | `idle` |

上表の相対パスは `assets/character/` を基点にする。 `assets/character/manifest.json` の `assets[].file` に相対パスを保存し、`assets.ts` のURL辞書にも登録する。

## 重要な落とし穴

- `PngCharacterRenderer.hitTest()` は画像のアルファ値を使う。元WebPは不透明なので、白背景が画素としてヒットし、透明クリック透過が壊れる。
- テスト素材4枚が既に `idle/neutral` 等に対応している。単純に追加すると同じ状態に2件並ぶ可能性がある。**新規本番素材を選択できる優先順を実装・テスト**し、元のテストが引き続き回るようにする。
- 今のRendererは `src/shared/character-state.ts` が表情IDの正本。 `normal` や `sweet` 等を型に追加しない。
- PSDやLive2DデータはPNGランタイム表示とは別の成果物。Live2Dへの移行時にも `CharacterRenderer` の境界を守る。

## 推奨テスト

```bash
npm ci
npm run check
npm run test:smoke
npm run test:character
```

画像未配置の場合は実装せず、**「必要な画像がまだ提供されていない」**と明示。権利・画質の確認も省略しない。
