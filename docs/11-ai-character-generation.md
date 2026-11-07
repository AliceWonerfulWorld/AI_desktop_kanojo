# AI画像生成によるキャラクター制作指示書

> 以前の「絵師への発注書」案に代わり、**AIにイラストを作らせるための仕様・手順書**として使用する。
> 状態: デザイン承認済み / 画像の最終編集・PNG整備とLive2D化は未実施
> プロジェクト: AI_desktop_kanojo / キャラ: 小春（仮）
> 参照: [キャラ設定](10-character-profile.md) / [素材一覧](12-character-assets.md) / [Live2D計画](09-live2d-plan.md)

## 1. 制作の狙い

**同じ成人女性キャラクターを、通常立ち絵・表情・衣装・イベントでも一貫して再現**する。
ユーザーが長時間デスクトップで眺める前提のため、派手さより見やすさ・同一性・Live2D加工しやすさを優先する。

## 2. 固定デザイン（一次案）

- 明確に20代成人女性（仮に23歳）
- 元気で明るい、人懐っこい。親密になると照れながら甘える
- 華奢で細身、色白、自然で健康的な成人プロポーション
- ライトブラウン〜アッシュブラウンの**高いサイドポニーテール**、ふんわりした毛先、**淡いピンクの花飾りとクリームのリボン**
- アンバー系の瞳、大人っぽさを保った親しみやすい笑顔
- アイボリーのケーブル編みカーディガン、ピンクのリブ・フリル付きトップス、白いハイウエストショートパンツ、細いベルト、ピンクのリボンチョーカー、フリルソックス、ミント色スニーカー、腕時計
- アニメ調・オリジナルキャラクター・シンプルな背景または透過
- 全身、手指・足先まで画面内、前髪と顔が判別可能

## 3. 第一段階：キャラ基準画像を確立

1. **マスターデザインは選定済み**。今後は [承認済みマスタービジュアル仕様](14-koharu-master-design.md) とユーザー選定画像をセットで参照する。
2. マスター画像を基準に、髪型、瞳、服装、体型、アクセサリー、色を固定する。
3. 正面全身／顔アップ／シンプルな配色見本を作り、デザインシートにまとめる。
4. 以後の追加生成は**固定参照画像**を利用する。可能なら同じモデル・設定で制作し、生成設定を記録する。
5. 顔の形、頭身、髪型、瞳色、衣装の特徴に矛盾がある画像は採用しない。

### ベース立ち絵用プロンプト（出発点）

```text
Original anime-style character design, one clearly adult Japanese woman age 23,
slender and delicate but natural adult proportions, fair skin with a healthy blush,
warm light ash-brown hair in a high side ponytail with soft curls and wispy bangs,\na pale pink flower clip and ivory ribbon at the ponytail base, warm amber eyes,
cheerful friendly smile, ivory cable-knit cardigan over a pastel-pink\nribbed ruffle-trimmed top with little bow, high-waisted ivory shorts with a slim belt,\npink ribbon choker, delicate wristwatch, frilly white socks and mint sneakers,
clean full-body front three-quarter view,
standing naturally with both hands clearly visible,
feet fully visible, uncluttered plain background,
clear outlines, consistent character design, soft balanced colors,
suitable for a 2D desktop companion and future Live2D rigging,
no text, no logo, one person only.
```

### 避けたい要素（ネガティブ指示の例）

```text
child, teenage appearance, school uniform, chibi proportions,
extra limbs, missing fingers, cropped head, cropped feet,
heavy perspective, extreme dynamic pose, excessive accessories,
multiple people, text, watermark, background clutter, inconsistent outfit.
```

サービスによってネガティブ指示の扱いが異なるので、必ず使用ツールの仕様に合わせる。

## 4. 第二段階：表情差分・衣装差分

**表情を作る際は、身体・髪型・衣装・顔の比率を変えず、目・眉・口・頬のみを変える**ことを基本にする。

| ID | 表情 | 目的 |
| --- | --- | --- |
| EXP-01 | 通常笑顔 | ベース |
| EXP-02 | 満面の笑み | 元気な挨拶 |
| EXP-03 | 眠そう | 夜・朝 |
| EXP-04 | 驚き | クリック反応 |
| EXP-05 | 照れ | 仲良くなった際 |
| EXP-06 | 甘え顔 | 関係性後半・将来 |

衣装差分は、通常衣装を完成後、部屋着・パジャマの順に制作する。同一人物性と重心・等身の一致をチェックする。

## 5. Live2Dへの変換工程（重要）

**AIで生成した完成PNGをCubismに入れるだけではLive2D用モデルにはならない。**

必要な作業:
1. 基準立ち絵を決定する
2. 画像を顔・左右目・眉・口・前後髪・胴体・腕・衣装・手等に切り分ける
3. 髪の下の額、顔の下、袖の下など、**隠れている部分を描き足す**
4. 各パーツの境界・重なり・色ズレ・透明ゴミを手動で修正
5. **パーツ分け用PSD**を編集・保存
6. **Cubismインポート用PSD**を別名で作成（原則1パーツ1レイヤー、適切なRGB/sRGB）
7. Cubism Editorに読み込み、変形・デフォーマ・パラメータ・物理演算・モーションを組む
8. モデルデータをSDKに統合してElectronで検証

AIにパーツ分割や補完を補助させることは可能だが、**品質保証や正しいレイヤー構造は別途検証が必要**。自動でPSDやLive2D完成モデルが生成されると約束しない。

Live2D公式:
- https://docs.live2d.com/cubism-editor-manual/divide-the-material/
- https://docs.live2d.com/cubism-editor-manual/psd-import/
- https://docs.live2d.com/cubism-editor-manual/reimport-psd/

## 6. AI制作の保存・追跡

生成物ごとに下記を記録する:
- AIサービス・モデル名とバージョン、生成日
- プロンプト、参照画像、使用設定（公開・保存が許される範囲）
- 採用/不採用、修正点、加工の履歴
- 商用利用、成人向け利用、再配布、画像編集、データ入力に関する規約確認日
- 使用した外部素材・参考画像の出典と権利
- 結果のチェック記録（顔一致、手足、服、背景の透過、ノイズなど）

**禁止:** 無断取得した第三者画像、特定作品キャラに酷似した画像、権利が不明なモデル・LoRA・素材をそのまま頒布物へ混ぜない。

## 7. DLsite公開に向けた注意

DLsiteは「AI生成作品」「AI一部利用」の区分を設け、**生成AIを使った程度と箇所の表示**を求めている。今回のようにメインキャラクターの見た目をAIで生成する場合は、**「AI一部利用」だと決めつけない**。実際の成果物と登録時点のルールを照らし、必要なら事前にDLsiteへ相談する。

- 公式告知（AI区分の定義）: https://info.eisys.co.jp/dlsite/bb3b0b976520e0fd?locale=ja_JP
- 公式告知（AI生成フロア）: https://info.eisys.co.jp/dlsite/dcbab34695586403?locale=ja_JP

### 例：利用説明文（仮）
「キャラクター原画の制作に画像生成AIを使用し、採用画像を加工・パーツ分け・Live2Dモデル化しています。プログラム、会話、アニメーション制御などは別途制作しています。」

※実際に行った制作工程だけを記載し、カテゴリはDLsiteの最新基準で決定する。

## 8. AIへの依頼・生成を開始する前のチェック

- [x] キャラクターの基準デザインを確定（通常／照れ／甘えの演技も承認）
- [ ] 使用するAIサービス・モデルの規約を確認
- [ ] 生成画像を複数比較し基準立ち絵を1枚決める
- [ ] 透過PNGを確認
- [ ] 表情差分の顔一致チェック
- [ ] Live2D用パーツ分け可能性を確認
- [ ] 素材・モデル・SDKの商用配布条件を確認

## 9. 確定版：追加生成・表情差分のプロンプト

**重要:** 画像をゼロから生成するよりも、ユーザーが選定した**元画像を参照画像として与えて編集生成**する。文章のみで同一人物を完全再現できる保証はない。腕やポーズが変わる場合も顔・髪・衣装・靴・小物を変えない。

### 共通固定指示（英語）

```text
Use the attached approved Koharu master character illustration as the
canonical reference. Preserve exactly the same clearly adult 23-year-old
woman, same face shape, slender adult proportions, fair skin, amber eyes,
light ash-brown high side ponytail with wispy bangs and soft curls,
pink flower hair ornament with cream ribbon, ivory cable-knit cardigan,
pastel-pink ribbed ruffle-trimmed top with a small bow, pink ribbon choker,
high-waisted ivory shorts and belt, wristwatch, frilly white socks,
and mint-green sneakers. Retain her original soft pastel anime illustration
style, warm friendly personality, linework, costume seams, accessories,
proportions, colors and shading. A single full-body character, head to toe,
clean plain white or transparent background, no text, no watermark.
Do not redesign the character, alter her age or face, switch hairstyle,
change outfits, remove accessories, or crop hands and feet.
```

### 通常表情（normal）

```text
Expression: open, cheerful and welcoming smile, lively sparkling amber eyes,
subtle natural blush, energetic but not exaggerated. For the standard
character reference, one raised hand in a friendly wave. Keep her
approved master design unchanged.
```

### 照れ表情（shy）

```text
Expression: shy, softly smiling, cheeks more visibly blushed,
eyes looking slightly downward, shoulders drawn in a little, both hands
gently clasped in front of her. She remains a cheerful adult woman,
not childlike. Preserve all approved character design details exactly.
```

### 甘え表情（affectionate）

```text
Expression: tender, affectionate and slightly bashful, warm upward glance,
soft tiny pout or gentle smile, rosy cheeks, a subtle forward lean,
both hands held close to her chest or cardigan collar in a sweet gesture.
Keep it natural, wholesome and non-explicit; maintain the same
approved adult character design exactly.
```

### Live2D用ニュートラルポーズ（rig-neutral）

```text
Keep the approved Koharu character design exactly. Change only the pose:
front-facing or slight three-quarter view, shoulders relaxed, arms lowered
naturally with hands visible and not obscuring the body, balanced feet,
neutral cheerful expression. Clean full-body composition with enough space
around hair, arms, hands and feet for future Live2D part separation.
```

### 差分のチェック
- [ ] 参照元マスターの顔・髪型・髪飾り・衣装・足元が一致
- [ ] 通常／照れ／甘えの違いが表情だけでも判別できる
- [ ] ポーズごとに腕時計・ベルト・リボン等が消えたり増えたりしていない
- [ ] Live2D用PSD・Cubismモデルが自動完成したと誤認しない
