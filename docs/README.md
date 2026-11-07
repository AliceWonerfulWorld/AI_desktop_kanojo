# ドキュメント一覧

このフォルダーは「AI_desktop_kanojo（仮）」の企画・設計・公開準備資料を管理する場所です。

> 状態: 企画初期 / ハッカソン向けMVPを設計中（2026-11-07）
> プロダクト名とキャラクター設定は仮決定です。AI機能の搭載は未決定で、MVPでは必須としません。

## 目次

| ファイル | 目的 |
| --- | --- |
| [01-concept.md](01-concept.md) | コンセプト・対象ユーザー・差別化 |
| [02-requirements.md](02-requirements.md) | MVP要件・非機能要件・スコープ |
| [03-architecture.md](03-architecture.md) | 技術構成・データ設計・セキュリティ |
| [04-behavior-spec.md](04-behavior-spec.md) | 自律行動・時間帯・関係性・生活記憶の仕様 |
| [05-roadmap.md](05-roadmap.md) | 実装順・Issue対応・完了基準 |
| [06-release-checklist.md](06-release-checklist.md) | DLsite販売に向けた確認事項 |
| [07-ui-ux.md](07-ui-ux.md) | 参考記事を踏まえたUI/UX方針・2モード・操作導線 |
| [08-screen-layouts.md](08-screen-layouts.md) | 日常・設定・交流画面のワイヤーフレーム案 |
| [09-live2d-plan.md](09-live2d-plan.md) | Live2D技術検証と段階的な導入計画 |
| [10-character-profile.md](10-character-profile.md) | 小春（仮）のキャラ設定、性格・生活・関係性 |
| [11-ai-character-generation.md](11-ai-character-generation.md) | AI画像生成用の指示、品質管理、Live2D加工工程 |
| [12-character-assets.md](12-character-assets.md) | PNG/PSD/Live2D用の素材一覧と優先度 |
| [14-koharu-master-design.md](14-koharu-master-design.md) | 承認済み小春マスタービジュアルと通常・照れ・甘えの仕様 |
| [15-codex-asset-integration.md](15-codex-asset-integration.md) | Codexへの正式小春素材統合指示・検証条件 |
| [16-gemini-live2d-parts-prompt.md](16-gemini-live2d-parts-prompt.md) | Geminiに送るPSDパーツ分け設計・生成プロンプト |

| [15-character-renderer-validation.md](15-character-renderer-validation.md) | PNG差分、描画API、アルファ判定と検証 |

| [17-behavior-engine-validation.md](17-behavior-engine-validation.md) | 自律行動の継続時間・遷移・通知・停止復帰の検証 |

## 意思決定済み
- 成人キャラクター1名のデスクトップ常駐アプリ
- 自律的な生活が主役（A）、親密度の変化は補助（B）
- 2D立ち絵、表情・行動差分を利用
- メインキャラは明るく元気、親密になると甘える一面を見せる、華奢で色白の成人女性
- キャラ原画はAI画像生成を使用する方針。**小春の基準ビジュアルと通常・照れ・甘えの表現方針は承認済み**（画像のGitHub配置・ゲーム素材化・商用規約確認は今後）
- MacBook Air（Apple Silicon / macOS）でMVPを先行開発し、Windows対応は後段で検証
- 初期技術候補: Electron + TypeScript
- ローカル保存・オフライン優先
- 成人向け表現はユーザーの明示操作で表示する方向

## 未決定
- 正式な製品名・キャラクター名の正式採用（小春は仮名）
- ハッカソンの日程・チーム人数・審査基準
- 正式なLive2D制作範囲と使用する画像生成AI・モデル
- 音声・AI会話の搭載範囲と費用
- 正式な販売価格・Windows配布の優先度・検証環境

小春の5枚のWebP原画（通常・照れ・眠そう・驚き・甘え）は受領済みで、リポジトリへの画像登録・背景透過は未実施。詳細は [小春素材台帳](../assets/character/koharu/manifest.md)。

## 開発管理
[GitHub Issues](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues) で実装タスクを管理します。仕様変更時は関連ドキュメントとIssueを更新してください。

[MVP-02 検証記録](13-desktop-window-validation.md): 透明常駐・クリック透過・DPI の検証結果と制限。

## Codexでの実装
リポジトリルートの [AGENTS.md](../AGENTS.md) を確認し、各Issueを受け入れ条件まで実装してください。
