# 小春 — 画像素材台帳（本番候補）

> 更新日: 2026-11-07
> 状態: **5枚の生成画像は会話で受領・確認済み。ただし本リポジトリには画像ファイル未配置。**
> **これは本番候補の管理台帳**。現在のアプリで読み込む機械可読マニフェスト [../manifest.json](../manifest.json) は、引き続き4枚の幾何図形テスト用PNGを参照している。両者を混同しないこと。

## 1. キャラと参照資料

- キャラクター: 小春（仮称）、明るく元気。親密になると照れたり甘えたりする成人女性
- デザイン正本: [docs/14-koharu-master-design.md](../../../docs/14-koharu-master-design.md)
- 生成フロー: [docs/11-ai-character-generation.md](../../../docs/11-ai-character-generation.md)
- 本番素材を既存Rendererへ統合する手順: [docs/15-codex-asset-integration.md](../../../docs/15-codex-asset-integration.md)
- Live2Dパーツ分け依頼: [docs/16-gemini-live2d-parts-prompt.md](../../../docs/16-gemini-live2d-parts-prompt.md)

## 2. 受領画像の事実（ローカル画像を確認済み）

会話添付の実ファイルはすべて **WebP / 572×1024px / RGB（不透明、アルファチャンネルなし）**。背景は見た目が白いが透過されていない。

| 添付時の元ファイル名（厳密な表記） | 意味上の表情ID | 位置付け | 本番用に完成させるファイル名 | GitHub上の画像 |
| --- | --- | --- | --- | --- |
| `koharu_normal.webp` | `neutral` | 自然立ち・通常表情の基準 | `png/standing_neutral.png` | 未配置 |
| `koharu_shy.webp` | `shy` | 照れの表情参考 | `png/standing_shy.png` | 未配置 |
| `koharu_sleeping.webp` | `sleepy` | 眠そうな表情参考（全身睡眠ポーズではない） | `png/standing_sleepy.png` | 未配置 |
| `koharu_suprising.webp` | `surprised` | 驚きの表情参考（元ファイル名に綴り違いあり） | `png/standing_surprised.png` | 未配置 |
| `koharu_sweet.webp` | `affectionate` | 甘える表情参考 | `png/standing_affectionate.png` | 未配置 |

- `normal` はアプリ上の型 `neutral` に対応。
- `sweet` はアプリ上の型 `affectionate` に対応。
- `sleeping.webp` の用途は「眠そうな顔」であり、行動 `sleeping` の専用全身絵ではない。
- 5枚は姿勢・位置が似ているが、**画素単位で完全一致する表情差分とは未検証**。切替時の位置・輪郭・陰影の揺れを確認する。
- いずれも **Live2Dのパーツ分けPSDではない**。

## 3. 正式素材への処理工程

1. 5枚の元WebPは消さず、制作元データとして安全に保管する。
2. 基準となる `normal` 画像を採用し、他4枚の位置・顔・衣装の一貫性を検査する。
3. 白背景を**実際のアルファ透明**にする。単に .webp を .png にリネーム / 変換しただけでは透過しない。
4. 境界に白フリンジ、白い穴、細い線の欠損がないか拡大確認する。
5. 可能なら高解像度の同一キャラ原画を作成し、元画像と比べて顔が変わらないか検証する。単純なアップスケールでは描き足し・パーツ分割が自動完成しない。
6. `png/standing_*.png` を**透過RGBA**で生成し、各ファイルのサイズ・アルファ有無・見た目を検証する。
7. 配布・商用利用・成人向け利用と生成AIの利用条件を確認し、記録する。
8. 実ファイルが揃い、使用条件が確認できてから、既存の `assets/character/manifest.json` と `src/renderer/src/character/assets.ts` に追加する。テスト素材を勝手に削除しない。

## 4. 本番画像の目標構成（未作成）

```text
assets/character/
├── manifest.json          # 既存ランタイム正本: 現状はテスト素材だけ
├── test/                  # 既存PNGテスト素材: 消さない
└── koharu/
    ├── manifest.md        # 本台帳: GitHub配置済み
    ├── source/            # 生成された元画像（公開する場合は権利・容量を確認）
    ├── reference/         # 選定したデザイン・差分参考画像
    ├── png/               # 透過・位置合わせ済みのランタイム画像
    │   ├── standing_neutral.png
    │   ├── standing_shy.png
    │   ├── standing_sleepy.png
    │   ├── standing_surprised.png
    │   └── standing_affectionate.png
    └── live2d/
        ├── koharu_material_separation.psd
        ├── koharu_import.psd
        └── exports/       # Cubism SDK向けモデル出力（未制作）
```

上記は**最終的な予定構成**であり、フォルダーや画像が既に存在するという意味ではない。

## 5. 生成・利用の記録（未確定部分は未確認と明記）

| 項目 | 記録 |
| --- | --- |
| 画像生成サービス | Gemini（ユーザー申告） |
| 画像生成モデル/バージョン | 未確認 |
| 生成日 | 未確認（会話への添付: 2026-11-07） |
| マスター参照 | 小春の採用済みデザイン画像を参照したとの経緯 |
| 商用利用条件 | 未確認（販売前に正式確認） |
| 成人向け作品での使用条件 | 未確認 |
| 利用先 | macOS先行・Windows将来対応のデスクトップ常駐アプリ |
| 配布先 | DLsite販売を検討。AI利用作品区分は審査時の最新規約を確認 |
| GitHubの利用許諾 | 画像については未確定。テスト画像のMITライセンスを流用しない |

## 6. Codex / 画像制作用AIの責任分界

- **画像制作用AI（Geminiなど）:** 画像生成、背景透過・解像度・レイヤー分割用の追加素材。出力は逐一人間が確認。
- **Codex:** 実ファイル・権利確認済みの画像の読み込みとマッピング、フォールバック、透明アルファ・クリック判定の回帰検証。
- **Cubism Editor:** 分割PSDを読み込んで、アートメッシュ・デフォーマ・パラメータ・モーション・書き出しを制作。
- **存在しない画像やPSD、Live2Dモデルを「完成済み」と扱わない。**
