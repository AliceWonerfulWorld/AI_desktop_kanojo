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

## 意思決定済み
- 成人キャラクター1名のデスクトップ常駐アプリ
- 自律的な生活が主役（A）、親密度の変化は補助（B）
- 2D立ち絵、表情・行動差分を利用
- Windows向けMVPを優先
- 初期技術候補: Electron + TypeScript
- ローカル保存・オフライン優先
- 成人向け表現はユーザーの明示操作で表示する方向

## 未決定
- 正式な製品名、キャラクターの設定・デザイン
- ハッカソンの日程・チーム人数・審査基準
- PNG差分を中心にするか、Live2Dを本格採用するか
- 音声・AI会話の搭載範囲と費用
- 正式な販売価格・対応OSの追加範囲

## 開発管理
[GitHub Issues](https://github.com/AliceWonerfulWorld/AI_desktop_kanojo/issues) で実装タスクを管理します。仕様変更時は関連ドキュメントとIssueを更新してください。
