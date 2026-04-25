# スプレッドシート「アイナナスコア計算 v1.0.5」完全仕様書

> **対象**: [Google スプレッドシート（ota-life.com 配布版）](https://docs.google.com/spreadsheets/d/1St4Hf609y9FobAn6-UjDIbkzDedo4Bssl5HT7PalFRk/edit)
>
> **採取日**: 2026-04-25
>
> **目的**: 今後このスプレッドシートを再解析する際に、毎回 playwright でセルを走査しなくても構造を把握できるようにする。`docs/spreadsheet-score-calc-diff.md` は i7 との比較・差分に特化した別文書なので、本書は **スプレッドシート単体の仕様リファレンス** として完結することを目指す。
>
> **採取方法**: `mcp__playwright__browser_evaluate` で Google Sheets の名前ボックス (`#t-name-box`) にセル参照を流し込み、`#t-formula-bar-input` から数式文字列を読み出す方式。`gviz/tq` API (CSV 出力) で評価後の値を補完。

## 0. 基本情報

- **ワークブック名**: 「【コピーしてご利用ください】アイナナスコア計算 v1.0.5 のコピー」
- **更新日**: 2026/04/17（「設定」シートの SCORE UP バッジ初期値変更、楽曲データ修正）
- **配布ページ**: `https://ota-life.com/id7-score-tool/`
- **利用方法**: 「ファイル → コピーを作成」でコピーしてから利用。編集権限リクエストは承認されない

## 1. シート一覧

以下の順序でタブバーに並んでいる:

| # | シート名 | 用途 | 本書での扱い |
| --- | --- | --- | --- |
| 1 | 更新履歴 | リリースノート | §2 |
| 2 | 使い方 | 利用者向け説明 | §3 |
| 3 | イベント集計 | 実プレイ結果と期待値の比較記録 | §4 |
| 4 | メモ | 自由記入欄 | §5 |
| 5 | スコア計算 | **メイン計算シート** | §6 全体 |
| 6 | ブローチ登録 | 装備ブローチのユーザー登録簿 | §7 |
| 7 | 所有カード登録 | 所有カードのユーザー登録簿 | §8 |
| 8 | 衣装データ | **カードマスター（作者管理）** | §9 |
| 9 | 設定 | 定数・ラビットノート | §10 |
| 10 | 楽曲データ | **楽曲マスター（作者管理）** | §11 |
| 11 | 楽曲リスト | 曲名リスト（ドロップダウン用） | §12 |
| 12 | 固有ブローチ | **カード固定ブローチ定義（作者管理）** | §13 |

**注**: タブクリック時の URL フラグメントは `#gid=1555231665` などだが、playwright から全タブの gid を機械採取したところ単一のフラグメントしか更新されなかったため、個別 gid の一覧は未特定。代わりに `gviz/tq?tqx=out:csv&sheet=<name>` で URL エンコード済みシート名でアクセス可能。

## 2. 更新履歴シート

CSV の一部抜粋:

```text
2025/04/11  配布開始                               v1.0.0
2025/04/15  SCOREUPバッジ初期倍率を15%に変更           v1.0.1
            イベント楽曲「Tenuto」「It's ALL-for you-」追加
            楽曲データは自動更新されるため再ダウンロードは不要
2025/04/21  「メモ」...（途中で切れる）
...
2026/04/17  楽曲データ修正、設定シートのSCORE UPバッジ初期値変更  (=v1.0.5)
```

列構成: `日付 / 内容 / バージョン / 備考`。単純な情報提供用。

## 3. 使い方シート

ユーザー向け注意書き。`【はじめに】` の下に `「ファイル」▷「コピーを作成」でコピーしてから利用してください。` などの注意文が並ぶ。計算には関与しない。

## 4. イベント集計シート

| 列 | 内容 |
| --- | --- |
| B | ↓入力可↓ 楽曲 |
| C | 実績 ライブ終了時 |
| D | ↓入力可↓ 最終リザルト |
| E | ↓入力可↓ 期待値 |
| F | 期待値との差 |
| G | 達成率 |

最終行に合計が入る。ユーザー側の手動記録用シート。計算ロジックへのフィードバックは無い。

## 5. メモシート

列: `日付 / 楽曲 / ライブ終了時 / 最終スコア / GOOD / BAD / MISS / メモ`。ユーザー自由記入。

## 6. スコア計算シート（最重要）

計算エンジンの中核。UI 表示エリア (列 A-M) と編集不可のエンジンエリア (列 AK 以降) に大別される。

### 6-1. 列レイアウト概要

| 列範囲 | 役割 |
| --- | --- |
| A-F | UI ラベル・入力項目（楽曲選択、スキルオプション、計算結果サマリ） |
| G | 中央の行ラベル（「楽曲割合」「登録カード」「スキル」等） |
| **H, I, J, K, L, M** | 6 枚のカードスロット（**スロット 1-6**）。UI 上は: `H=1枚目 / I=2枚目 / J=3枚目=センター / K=4枚目 / L=5枚目 / M=6枚目=フレンド` |
| N-AJ | 空白 or 表示用パディング |
| AK | 「→→→→ここから先編集不可→→→→」マーカー |
| AL | 内部エリアの行ラベル |
| **AM, AN, AO, AP, AQ, AR** | 6 枚のスロットに対応する**内部計算列**（1:1 対応）。AQ/AR がセンター/フレンド処理の分岐点になることが多い |
| AS-AT | ラビットノート中間変数（キャラ名参照） |
| **AU, AV, AW, AX** | ブローチ合計エリア (Shout/Beat/Melody/count) |
| AY-AZ | ライト倍率テーブル |
| **BA-BF** | 属性値スコアマトリクス（6 列: S白/S色/B白/B色/M白/M色） |
| BG-BH | パディング |
| **BI-BN** | 属性値スコアのセル積マトリクス（per-note × note-count） |
| BN21-BN23 | 属性値スコア集計（縮小用基準も含む） |

### 6-2. UI 表示エリア（A-M 列）

#### 楽曲情報・オプション（行 3-17）

| セル | 内容 | 備考 |
| --- | --- | --- |
| `B3:D3` | 「楽曲」ヘッダ | 結合セル |
| `B4 / D4` | 種類ラベル / 入力（例: イベント楽曲） | `D4` がドロップダウン |
| `B5 / D5` | 分類ラベル / 入力 | — |
| `B6 / D6` | 曲名ラベル / 入力 | `D6 = "Binary Vampire"` など。`AQ4` で楽曲データにマッピング |
| `B7 / D7` | アーティスト名 | — |
| `B8 / D8` | ノーツ数 | 楽曲マスターから同期、計算で `$D8` として多用 |
| `B9 / D9` | 秒数 | `$D9` として多用（カバー率分母） |
| `B11:C11` | 「スキルオプション」ヘッダ | — |
| `B12 / C12` | スコアアップフル発動チェック | `$B12` がフラグ |
| `B13 / C13` | スコアアップ確率UP チェック | `$B13` |
| `B14 / C14` | %UP 値 | `$C14 = 10` (既定) |
| `B15 / C15` | 縮小フル発動チェック | `$B15` |
| `B16 / C16` | 20ノーツ加算なし (β版) チェック | `$B16`。「縮小フル発動時のみ動作」と注記あり |

#### 楽曲割合／編成画面属性値（行 3-6 の G 列周辺）

| セル | 内容 |
| --- | --- |
| `G3:G6` | 楽曲割合 / 編成画面属性値 のラベル |
| `H4 / J4 / L4` | "Shout" / "Beat" / "Melody" 文字列 |
| `I4` | `=TEXT(AN68,"#,###")&"+"&TEXT(AR63,"#,###")` (Shout 表示) |
| `K4` | `=TEXT(AP68,"#,###")&"+"&TEXT(AR64,"#,###")` (Beat) |
| `M4` | `=TEXT(AR68,"#,###")&"+"&TEXT(AR65,"#,###")` (Melody) |
| `I6` | SCOREUPアシスト チェックボックス (TRUE/FALSE) |
| `K6` | SCOREUPバッジ チェックボックス |
| `M6` | 縮小カバー率 `=IFERROR(SUM(H39:M39)/D9,)` |

#### カード入力エリア（行 7-22）

各スロット列（H-M）で以下のドロップダウン:

| 行 | 内容 |
| --- | --- |
| `8` | 登録名（所有カード登録からの参照 or 直接入力） |
| `9` | レアリティ (UR/SSR/...) |
| `10` | アイドル名 |
| `11` | カード種類 |
| `12` | カード名称 |
| `13-18` | カード画像・センター/フレンド表示 |
| `20` | カード属性 (`=IFERROR(filter('衣装データ'!$K:$K, '衣装データ'!$A:$A=<card_id>),)`) |
| `21` | 特訓 (チェックボックス) |
| `22` | 特効 (ドロップダウン: 金特効/銀特効/銅特効/特効なし) |

#### 計算結果サマリ（行 19-25）

| セル | 内容 | 数式 |
| --- | --- | --- |
| `B19:D19` | 「計算結果」ヘッダ | — |
| `B20 / D20` | 属性値スコア | `=BN21` |
| `B21 / D21` | スコアアップスキル | `=SUM(H38:M38)` |
| `B22 / D22` | 縮小スキル | `=SUM(H40:M40)` |
| `B23 / D23` | ライブ終了時 | `=SUM(D20,D21,D22)` |
| `B24 / D24` | 最終リザルト | `=IF(K6=TRUE, ROUNDDOWN(D23*(1+'設定'!$B$3),0), D23)` |
| `D25` | 警告メッセージ | `=IF($B$15=FALSE, IF(M6>100%, "縮小発動時間が超過しています",),)` |

#### スキル情報表示（行 25-40、H-M 列）

| 行 | 項目 | 補足 |
| --- | --- | --- |
| `25` | カード Shout | 特訓/未特訓反映後 |
| `26` | カード Beat | — |
| `27` | カード Melody | — |
| `28` | ブローチ① ドロップダウン | ユーザー選択 |
| `29` | ブローチ② ドロップダウン | ユーザー選択 |
| `30` | ブローチ Shout | — |
| `31` | ブローチ Beat | — |
| `32` | ブローチ Melody | — |
| `33` | スキル種別 ラベル | — |
| `34` | スキルレベル (1-5) | ユーザー選択 |
| `35` | 発動条件 (Perfect / コンボ / タイマー) | — |
| `36` | カウント | 衣装データからの VLOOKUP |
| `37` | 確率 | — |
| `38` | スコア／秒／回 | — |
| `39` | 倍率 (縮小 rate) | 縮小スキルのみ非空 |
| `40` | スコアアップスキル期待値 | `H38:M38` → D21 に集約 |

（注: 「スキル」系は上記のように H 列の行 31 以降に `IFERROR + IFS` の巨大式として展開される。主要数式は §6-4 に列挙）

### 6-3. 内部計算エリア（列 AL-AW）スロット × 属性ブロック

列 AM-AR が 6 スロット、行 8-60 付近が「1 スロットの属性値計算の全段階」を網羅。

#### スロット入力参照 (AM = スロット 1 の例)

| 行 | ラベル (AL) | 数式 (AM) | 備考 |
| --- | --- | --- | --- |
| `8` | (スロット番号) | リテラル "1枚目" | — |
| `9` | (衣装 ID) | `=IFERROR(IF(AND(H$8<>"",H$8<>"未登録カードを選択"), filter('所有カード登録'!$J:$J, '所有カード登録'!$B:$B=H$8), filter('衣装データ'!$A:$A, (H9='衣装データ'!$G:$G)*(H11='衣装データ'!$C:$C)*(IFERROR(FIND(H10,'衣装データ'!$E:$E),0)))), "error")` | 衣装 ID を解決 |
| `10` | — | `=IFERROR(filter('衣装データ'!$B:$B, AM9='衣装データ'!$A:$A),)` | カード ID |
| `11` | — | `=IFERROR(filter('衣装データ'!$D:$D, AM9='衣装データ'!$A:$A)&"["&filter('衣装データ'!$C:$C, ...)&"]",)` | キャラ名 + 衣装名 |
| `12` | — | `=IFERROR(filter('衣装データ'!$D:$D, AM9='衣装データ'!$A:$A),)` | キャラ名（単独） |
| `13` | — | `=IFERROR(VLOOKUP(AM12, $AT$30:$AU45, 2,),)` | グループ名（IDOLiSH7 / TRIGGER / ...） |
| `14` | — | `=IFERROR(filter('衣装データ'!$K:$K, '衣装データ'!$A:$A=AM$9),)` | カード属性 |

#### 属性値 Raw (AM16/17/18)

| 行 | ラベル | 数式 |
| --- | --- | --- |
| `16` (Shout) | — | `=IFERROR(filter('衣装データ'!$M:$M, '衣装データ'!$A:$A=AM$9),)` |
| `17` (Beat) | — | `=IFERROR(filter('衣装データ'!$O:$O, '衣装データ'!$A:$A=AM$9),)` |
| `18` (Melody) | — | `=IFERROR(filter('衣装データ'!$Q:$Q, '衣装データ'!$A:$A=AM$9),)` |

#### 特訓回数・加算値（AM20 / AM21 / AM22）

| 行 | ラベル | 数式 |
| --- | --- | --- |
| `20` 回数 | `sp_time` | `=IFERROR(filter('衣装データ'!$AQ:$AQ, '衣装データ'!$A:$A=AM$9),)` |
| `21` 加算値 | `sp_value` | `=IFERROR(filter('衣装データ'!$AR:$AR, '衣装データ'!$A:$A=AM$9),)` |
| `22` 特訓有無 | — | `=IF(AND(H$8<>"", H$8<>"未登録カードを選択"), filter('所有カード登録'!$E:$E, '所有カード登録'!$B:$B=H$8), H21)` |

#### 特訓判定後属性値 (AM25 / AM26 / AM27)

```text
AM25 = IF(AND(AM$14="Shout",  AM$22=FALSE), AM16 − AM$20*AM$21, AM16)   // Shout
AM26 = IF(AND(AM$14="Beat",   AM$22=FALSE), AM17 − AM$20*AM$21, AM17)   // Beat
AM27 = IF(AND(AM$14="Melody", AM$22=FALSE), AM18 − AM$20*AM$21, AM18)   // Melody
```

未特訓なら `自属性 − sp_time × sp_value` で差し引く (`TRAIN_BONUS` 相当)。他 2 属性は `_max` のまま。

#### 特効倍率 (AM28) + 特効加算後 (AM29 / AM30 / AM31)

```text
AM28 = IFERROR(
  VLOOKUP(
    IF(AND(H$8<>"", H$8<>"未登録カードを選択"),
       filter('所有カード登録'!$F:$F, '所有カード登録'!$B:$B=H$8),
       H$22),
    '設定'!$B$6:$C$9, 2,),)      // B6:C9 = 特効ランク表（140%/120%/100%/0%）

AM29 = IFERROR(ROUND(AM25 * (1+AM28), 0), AM25)    // 特効加算後 Shout
AM30 = IFERROR(ROUND(AM26 * (1+AM28), 0), AM26)    // Beat
AM31 = IFERROR(ROUND(AM27 * (1+AM28), 0), AM27)    // Melody
```

**注**: `ROUND` を使う (`ROUNDDOWN` ではない) ため、四捨五入される。i7 は `round` 採用で整合。

#### 固定ブローチ処理 (AM33-AM39)

```text
AM33 = IFERROR(IF(filter('衣装データ'!$I:$I, '衣装データ'!$A:$A=AM$9)="URブローチ","◯",""),)
AM34 = IF(AM33="◯", filter('固有ブローチ'!$R:$R, '固有ブローチ'!$A:$A=AM9),)  // ブローチの種類 (1-9)
AM35 = IF(AM33="◯", filter('固有ブローチ'!$Q:$Q, '固有ブローチ'!$A2:$A=AM$9),)  // 上限 (limit)
AM36 = IF(AM33="◯", IF(AM35>=1, IF(COUNTIF($AM$9:AM$9, AM9) <= AM35, "◯", "✗"), "◯"),)
```

**AM36 = 加算対象判定**: デッキ内で同カード ID が `limit` 枚以内なら有効。

```text
AM37 (★Shout) / AM38 (★Beat) / AM39 (★Melody) = 固定ブローチの属性値加算
  IFERROR(
    IF(AM$36="◯",
       IFS(
         AM$34=1, filter('固有ブローチ'!$G/$H/$I ...),                    // 属性UP（種類 1）
         AM$34=2, IF(AM$12=filter('固有ブローチ'!$L:$L, ...), filter(...)),  // アイドル指定（種類 2）
         AM$34=3, COUNTIF($AM$14:$AR$14, filter('固有ブローチ'!$K:$K, ...)) * filter('固有ブローチ'!$G/$H/$I:$I, ...),  // 属性カウント
         AM$34=4, IFS(COUNTIF($AM$13:$AQ$13, filter('固有ブローチ'!$M:$M, ...)) = COUNTA($AM$10:$AQ$10), filter(...)),  // グループ指定
         AM$34=5, COUNTIFS(..., アイドル, ..., 属性) * filter(...),        // アイドル属性指定カウント
         AM$34=6, filter('固有ブローチ'!$G/$H/$I:$I, ...),                   // 属性UP（上限型）
         AM$34=7, IF(AND(COUNTIF=Shout>0, Beat>0, Melody>0), filter(...), )  // 全属性存在時
       ), ), )
```

- 種類 8 (`AUTO`) はスコア寄与なし
- 種類 9 (`スコアUP`) は **固定ブローチスコア加算** として別経路（`AR63:AR65` 周辺）で処理される

#### 共有ブローチ①処理 (AM41-AM46)

```text
AM41 = H26                                       // ユーザー選択: ブローチ① 名前
AM42 = IFERROR(IF(AND(H26<>"", AM33<>"◯"), filter('ブローチ登録'!$C:$C, H26='ブローチ登録'!$B:$B),),)  // メイン/サブ区分
AM43 = IFERROR(IF(AND(H26<>"", AM33<>"◯"), filter('ブローチ登録'!$S:$S, H26='ブローチ登録'!$B:$B),),)  // ブローチの種類

AM44 / AM45 / AM46 = ①Shout / ①Beat / ①Melody 加算
  IFERROR(IF(
    OR(
      AND(AM$42="メイン", AM$50="メイン"),   // メイン 2 枠禁止
      COUNTIF($H$26:$L$27, AM$41) > 1        // 同名ブローチ重複禁止
    ),
    ,  // 除外
    IFS(AM$43=1 .. AM$43=5, ...種類 1-5 の加算条件)
  ),)
```

#### 共有ブローチ②処理 (AM49-AM54)

AM41-AM46 と同形だが、さらに **`AND(AM$33="◯", AM$50="メイン")` なら除外** というルールが加わる: **固有ブローチ持ちカードの UR 枠は共有ブローチ「メイン」を② に装備できない**。これは v1.0.5 の共有ブローチ枠数ガード。

#### スロット別ブローチ合計 (AM58/AM59/AM60)

```text
AM58 = SUM(AM37, AM44, AM52)   // Shout 合計 (固定 + 共有① + 共有②)
AM59 = SUM(AM38, AM45, AM53)   // Beat
AM60 = SUM(AM39, AM46, AM54)   // Melody
```

#### スロット別 基底+ブローチ (AM63-AM65)

```text
AM63 = AM29 + AM58             // Shout = 特効後 + ブローチ合計
AM64 = AM30 + AM59             // Beat
AM65 = AM31 + AM60             // Melody
```

### 6-4. チーム属性値合計 (AN-AR 列、行 60-72)

**注**: 以下の `AN*` は「スロット 2」の列ではなく、**チーム合計を Shout 用に使っている**。列マップが列方向で属性を兼ねる設計なので注意:

- `AN` 列 → **Shout 合計系**
- `AP` 列 → **Beat 合計系**
- `AR` 列 → **Melody 合計系**（フレンドスロット列でもある）

#### 行 60: ブローチ加算合計（フレンド分を除く自デッキ）

```text
AN60 = SUM(AN39, AN46, AN54)      // 実は AN 列はスロット 2 のブローチ合計… 
```

この行は **各スロット列の行 58/59/60** に割り振られているが、`BN21`・`AN67`・`AN68` に集約されるとき列方向で整理される。

#### 行 67-68: 自デッキ属性値合計

```text
AN67 = SUM(AM63:AQ63)            // 自デッキ Shout 合計（スロット 1-5）
AP67 = SUM(AM64:AQ64)            // Beat
AR67 = SUM(AM65:AQ65)            // Melody

AN68 = AN67 + AU26                // + ラビットノート Shout 合計
AP68 = AP67 + AV26
AR68 = AR67 + AW26
```

表示名 (AL 列):

- `AL67 = 自デッキカード属性値合計`
- `AL68 = ラビットノート加算後`

#### 行 69-72: フレンド合算 → センター/フレンドボーナス → アシスト

```text
AN69 = AN68 + AR63                // デッキ属性値合計 = 自デッキ Shout + フレンド Shout
AP69 = AP68 + AR64
AR69 = AR68 + AR65

AN71 = IFERROR(ROUNDDOWN(AN69 * (1 + IF($J20="Shout",0.1,0) + IF($M20="Shout",0.1,0)), 0),)
AP71 = IFERROR(ROUNDDOWN(AP69 * (1 + IF($J20="Beat",0.1,0)  + IF($M20="Beat",0.1,0)),  0),)
AR71 = IFERROR(ROUNDDOWN(AR69 * (1 + IF($J20="Melody",0.1,0)+ IF($M20="Melody",0.1,0)),0),)

AN72 = IF(I6=TRUE, ROUNDDOWN(AN71*1.2, 0), AN71)   // アシスト後 Shout appeal
AP72 = IF(I6=TRUE, ROUNDDOWN(AP71*1.2, 0), AP71)
AR72 = IF(I6=TRUE, ROUNDDOWN(AR71*1.2, 0), AR71)
```

表示名:

- `AL69 = デッキ属性値合計`
- `AL71 = センタースキル発動`
- `AL72 = スコアアップアシストあり`

**キーポイント**:

- センター（スロット 3 = 列 J）とフレンド（スロット 6 = 列 M）の属性が一致している場合のみ `+10%`
- センター/フレンド率は **10% 固定**（レアリティ不問）
- 両方 Shout ならまとめて `×1.2` (`1 + 0.1 + 0.1`) を 1 回の `ROUNDDOWN`
- アシスト ON なら appeal に `×1.2` を追加で `ROUNDDOWN`

### 6-5. 属性値スコアマトリクス（BA-BN 列、行 11-29）

#### 基礎テーブル（行 11-18: 1 ノーツ素点）

| セル | 内容 |
| --- | --- |
| `BA9 = "Shout"` / `BB9:BD9 = ..." / "BE9:BF9 = "Melody"` | 列ラベル |
| `BA10 = "白" / BB10 = "色"` ... | 白/色ラベル |
| `AZ11 = 1` | ライト倍率（notes_20 / light_2 相当） |
| `AZ12 = 1.1` | light_3 |
| `AZ13 = 1.2` | light_4 |
| `AZ14 = 1.3` | light_5 |
| `AZ15 = 1.5` | light_6 |
| `AZ16 = 2.6` | chorus_light_5 |
| `AZ17 = 3` | chorus_light_6 |

per-note 素点 `BA11:BF17` の形:

```text
BA11 = TRUE                               // ⚠️ BUG?: 本来は =ROUNDDOWN($AN72*2.5%) のはず
BB11 = =ROUNDDOWN($AN72*3%)               // Shout 色
BC11 = =ROUNDDOWN($AP72*2.5%)             // Beat 白
BD11 = =ROUNDDOWN($AP72*3%)               // Beat 色
BE11 = =ROUNDDOWN($AR72*2.5%)             // Melody 白
BF11 = =ROUNDDOWN($AR72*3%)               // Melody 色

BA12 = =ROUNDDOWN($BA11*$AZ12)            // Shout 白 × 1.1
...
BA17 = =ROUNDDOWN($BA11*$AZ17)            // Shout 白 × 3
```

**観察**: `BA11` が `TRUE` のリテラルになっている。結果 `BA12..BA17 = floor(1 × 1.1..3) = 1/1/1/1/2/3`。本来 Shout 白 per-note はもっと大きい値（例: `floor(9225 × 0.025) = 230`）になるはずなので、Shout 白は notes_20 帯で大幅過小評価される可能性。再調査対象。

#### ノート数テーブル（行 22-29）

8 ステージのノート数を `FILTER` で楽曲データから引き込む:

```text
BA22 = =IFERROR(IF(D6<>"", filter('楽曲データ'!$M3:$R, (AQ4='楽曲データ'!$A$3:$A)),),)  // notes_20 (6 col spill)
BA23 = =IFERROR(IF(D6<>"", filter('楽曲データ'!$S3:$X, ...),),)                          // light_2
BA24 = =IFERROR(IF(D6<>"", filter('楽曲データ'!$Y3:$AD, ...),),)                         // light_3
BA25 = =IFERROR(IF(D6<>"", filter('楽曲データ'!$AE3:$AJ, ...),),)                        // light_4
BA26 = =IFERROR(IF(D6<>"", filter('楽曲データ'!$AK3:$AP, ...),),)                        // light_5
BA27 = =IFERROR(IF(D6<>"", filter('楽曲データ'!$AQ3:$AV, ...),),)                        // light_6
BA28 = =IFERROR(IF(D6<>"", filter('楽曲データ'!$AW3:$BB, ...),),)                        // chorus_light_5
BA29 = =IFERROR(IF(D6<>"", filter('楽曲データ'!$BC3:$BH, ...),),)                        // chorus_light_6
```

ライト倍率テーブル `AZ22:AZ29`:

| セル | 値 | ステージ |
| --- | --- | --- |
| `AZ22` | 1 | notes_20 |
| `AZ23` | 1 | light_2 |
| `AZ24` | 1.1 | light_3 |
| `AZ25` | 1.2 | light_4 |
| `AZ26` | 1.3 | light_5 |
| `AZ27` | 1.5 | light_6 |
| `AZ28` | 2.6 | chorus_light_5 |
| `AZ29` | 3 | chorus_light_6 |

`AQ4` がキー (楽曲 ID):

```text
AQ4 = =IF(OR(D4="",D5="",D6=""),, IFERROR(filter('楽曲データ'!$A$3:$A, (D5='楽曲データ'!$B$3:$B)*(D6='楽曲データ'!$D$3:$D)*(D4='楽曲データ'!$E$3:$E)), "error"))
```

#### スコア積マトリクス（BI-BN 列、行 11-18）

```text
BI11 = =BA11*BA22   ...   BN11 = =BF11*BF22
BI12 = =BA11*BA23   ...   BN12 = =BF11*BF23    (※ 実装上の混乱: 本来 BA12*BA23 が意図？)
...
BI18 = =BA17*BA29   ...   BN18 = =BF17*BF29
```

採取結果では `BI11 = BA11*BA22`、`BI12 = BA11*BA23`、`BI18 = BA17*BA29` だった。一貫性のない行参照は **バグかドキュメント不整合** の可能性があるが、少なくとも `BI18/BN18` は `(BA17 = 色 or 白の per-note × 3倍) × chorus_light_6 note count` になる。再読み取り推奨。

#### 集計

```text
BN21 = =SUM(BI11:BN18)                                           // 属性値スコア（アシスト反映）
BN22 = =IF(I6=TRUE, ROUNDDOWN(SUM(BI11:BN18)/1.2, 0), BN21)       // 縮小用基準（アシスト剥離）
BN23 = =IF(I6=TRUE, ROUNDDOWN(SUM(BI12:BN18)/1.2, 0), SUM(BI12:BN18))  // β 用（行 11 = notes_20 除外）
```

### 6-6. スキル計算 (H31-H40) スロット 1 の例

各スロット H-M に対して同形の式が展開される。以下は H 列 (スロット 1) の例。`AM10` がそのスロットの衣装 ID。

#### H31 - スキル種別判定

```text
H31 = IFERROR(IFS(
        vlookup(AM10, '衣装データ'!$B:$AR, 17,) = "判定領域を",           "判定領域縮小",
        vlookup(AM10, '衣装データ'!$B:$AR, 17,) = "BAD以上をPerfectに変更", "判定強化",
        vlookup(AM10, '衣装データ'!$B:$AR, 17,) = "MISS以上をPerfectに変更","判定強化",
        vlookup(AM10, '衣装データ'!$B:$AR, 17,) = "MISS→Perfect",         "判定ガード",
        TRUE,                                                            vlookup(AM10, '衣装データ'!$B:$AR, 17,)
      ),)
```

戻り値: `"スコアアップ" / "判定領域縮小" / "判定強化" / "判定ガード" / "タイマー"` など。

#### H32 - スキルレベル (ユーザー入力、既定 5)

#### H33 - 発動条件

```text
H33 = IFERROR(vlookup(AM10, '衣装データ'!$B:$AR, 18,),)
    // → "Perfect" / "コンボ" / "タイマー"
```

#### H34-H37 - スキルパラメータ（レベル別）

スキルレベル (H32) に応じて衣装データの列オフセットを変える:

```text
H34 = vlookup(AM10, '衣装データ'!$B:$AR, 16 + (skillLevel × 4),)    // count
H35 = vlookup(AM10, '衣装データ'!$B:$AR, 17 + (skillLevel × 4),)    // per (%)
H36 = vlookup(AM10, '衣装データ'!$B:$AR, 18 + (skillLevel × 4),)    // value (秒 or スコア)
H37 = vlookup(AM10, '衣装データ'!$B:$AR, 19 + (skillLevel × 4),)    // rate (縮小倍率)
```

`skillLevel` は所有カード登録のスキルレベル or H32 から取得。

#### H38 - スコアアップスキル期待値

```text
H38 = IFERROR(ROUNDDOWN(IFS(
        H31 = "スコアアップ",
          IFS(OR(H33="Perfect", H33="コンボ"),
                $D8/H34 * IFS($B12=TRUE,1, $B13=TRUE,((H35+$C14)/100), TRUE,(H35/100)) * H36,
              H33="タイマー",
                $D9/H34 * IFS($B12=TRUE,1, $B13=TRUE,((H35+$C14)/100), TRUE,(H35/100)) * H36)
      )),)
```

- `$B12=TRUE` → per を 100% にする（フル発動）
- `$B13=TRUE` → per を `H35 + 10%` にする（確率UP）
- 分母 = `$D8` (Perfect/コンボ = ノーツ数) or `$D9` (タイマー = 秒数)

#### H39 - 期待縮小秒数（カード別）

```text
H39 = IFERROR(IFS(
        H31 = "判定領域縮小",
          IFS(OR(H33="Perfect", H33="コンボ"),
                IF($B$15=TRUE, ROUNDDOWN($D8/H34 * H36, 0),
                               ROUNDDOWN($D8/H34 * (H35/100) * H36, 0)),
              H33="タイマー",
                IF($B$15=TRUE, ROUNDDOWN($D9/H34 * H36, 0),
                               ROUNDDOWN($D9/H34 * (H35/100) * H36, 0)))
      ),)
```

- `$B$15` (縮小フル発動) TRUE なら per を省く

#### H40 - 縮小スキルスコア（カード別）

```text
H40 = IFERROR(IF(H31 = "判定領域縮小",
        IFS(
          $M$6 >= 1,                                     // coverage ≥ 100%
            IF($B$16=TRUE,
                 ROUNDDOWN($BN$23 * (H$39/SUM($H$39:$M$39)) * (H$37-1), 0),   // β: notes_20 除外
                 ROUNDDOWN($BN$22 * (H$39/SUM($H$39:$M$39)) * (H$37-1), 0)),
          TRUE,                                          // coverage < 100%
            ROUNDDOWN($BN$22 * H$39/$D$9 * (H$37-1), 0)
        ),
      ),)
```

- 100% キャップ時: seconds 比で按分 → 合計で `BN22 × (rate-1)` に収束
- 100% 未満時: `BN22 × coverage × (rate-1)` 相当（seconds / songDuration）

### 6-7. ラビットノートとブローチ集計（AT-AX 列、行 10-26）

ラビットノートはキャラ単位 → デッキに 1 枚でも存在するキャラの bonus を加算:

```text
AT10 = '設定'!$B$13        // キャラ名（和泉一織）
AU10 = '設定'!$C$13        // Shout 加算値
AV10 = '設定'!$D$13        // Beat
AW10 = '設定'!$E$13        // Melody
AX10 = COUNTIF($AM$11:$AQ$11, "*"&AT10&"*")   // 自デッキ（AM-AQ = 5 スロット）でこのキャラを含むカード数

...

AT25 = '設定'!$B$28        // 御堂虎於
AU25 = '設定'!$C$28
AV25 = '設定'!$D$28
AW25 = '設定'!$E$28
AX25 = COUNTIF($AM$11:$AQ$11, "*"&AT25&"*")

// 集計 (フレンド枠 AR を除く)
AU26 = SUMIF(AX10:AX25, ">=1", AU10:AU25)     // Shout ラビット合計
AV26 = SUMIF(AX10:AX25, ">=1", AV10:AV25)     // Beat
AW26 = SUMIF(AX10:AX25, ">=1", AW10:AW25)     // Melody
```

**重要**: `">=1"` 条件のため、キャラが **何枚デッキにいても加算は一度だけ**。i7 のカード単位加算とは異なる。フレンドスロット (AR/M 列) は **カウント対象外** (`AM:AQ` のみ)。

## 7. ブローチ登録シート

ユーザー編集可能な共有ブローチ登録簿。CSV 列ヘッダ（抜粋）:

| 列 | 内容 |
| --- | --- |
| B | 登録名 |
| C | メイン/サブ区分 |
| E | Shout |
| F | Beat |
| G | Melody |
| I | 条件（属性） |
| J | 条件（アイドル） |
| K | 条件（グループ） |
| S | ブローチの種類 (1-5) |

**ブローチの種類対応（スプレッドシート定義）**:

| 値 | 名称 |
| --- | --- |
| 1 | 属性UP |
| 2 | アイドル指定 |
| 3 | 属性カウント |
| 4 | グループ指定 |
| 5 | アイドル属性指定カウント |

**備考**: 配布テンプレートには BW2022Shout/BW2022Beat/BW2022Melody + `【ALL】`/`【Shout】`/`【Beat】`/`【Melody】` グループ配下の一覧（ALL750, ALL700, Shout1100 など）が初期登録されている。

## 8. 所有カード登録シート

| 列 | 内容 |
| --- | --- |
| B | 登録名 (スコア計算 H8-M8 で参照) |
| C | 名前 |
| D | 衣装 |
| E | 特訓 (TRUE/FALSE) |
| F | 特効 |
| G | スキルレベル (1-5) |
| H-Z | スキル詳細・属性値・特効/ブローチ加算 |

未入力行は `FALSE` が並ぶ。

## 9. 衣装データシート（カードマスター）

計算が依存する主要列:

| 列 | 内容 | スコア計算からの参照 |
| --- | --- | --- |
| A | (内部 ID) | `AM9` の FILTER キー |
| B | cardID | — |
| C | cardname (衣装名) | `AM11` |
| D | name (キャラ名) | `AM12` |
| E | name_other | カード同定 |
| G | groupname | `AM13` |
| I | URブローチ? | `AM33` 判定 |
| K | attribute (Shout/Beat/Melody) | `AM14` |
| L-Q | shout/beat/melody の min/max | `AM16/17/18` |
| R | ap_skill_type | — |
| 17列目 (≒R) | ap_skill_type | `H31` |
| 18列目 | ap_skill_req (発動条件) | `H33` |
| 19 + SL×4 ... | ap_skill_N_count / per / value / rate | `H34-H37` |
| AQ | sp_time (特訓回数) | `AM20` |
| AR | sp_value (特訓加算値) | `AM21` |

スキルレベル 1-5 がそれぞれ 4 列（count / per / value / rate）を持つので、`vlookup(card_id, B:AR, 16 + skillLevel×4, )` がパターン。

## 10. 設定シート

| 行 | B列 | C列 / D列 / E列 | 用途 |
| --- | --- | --- | --- |
| 2 | `SCOREUPバッジ` | — | ヘッダ |
| **3** | **`16%`** | — | バッジ倍率既定値 (`$B$3`) |
| 5 | `特効倍率` | `特効倍率` | ヘッダ |
| **6** | `金特効` | **`140%`** | `VLOOKUP` 範囲 `B6:C9` |
| 7 | `銀特効` | `120%` | — |
| 8 | `銅特効` | `100%` | — |
| 9 | `特効なし` | `0%` | — |
| 11 | `ラビットノート` (merged) | — | ヘッダ |
| 12 | — | `Shout / Beat / Melody` | 列ヘッダ |
| 13 | `和泉一織` | ユーザー入力 | スコア計算 `AT10/AU10/AV10/AW10` で参照 |
| 14 | `二階堂大和` | — | `AT11` |
| 15 | `和泉三月` | — | `AT12` |
| 16 | `四葉環` | — | — |
| 17 | `逢坂壮五` | — | — |
| 18 | `六弥ナギ` | — | — |
| 19 | `七瀬陸` | — | — |
| 20 | `八乙女楽` | — | — |
| 21 | `九条天` | — | — |
| 22 | `十龍之介` | — | — |
| 23 | `百` | — | — |
| 24 | `千` | — | — |
| 25 | `亥清悠` | — | — |
| 26 | `狗丸トウマ` | — | — |
| 27 | `棗巳波` | — | — |
| 28 | `御堂虎於` | — | スコア計算 `AT25:AW25` で参照 |

## 11. 楽曲データシート（楽曲マスター）

ノート数テーブル。列 M-BH に 8 グループ × 6 (attr × type) = 48 列。

| 列 | 内容 |
| --- | --- |
| A | ID |
| B | 分類 |
| C | アーティスト名 |
| D | 曲名 |
| E | 楽曲種類 |
| F | 難易度 |
| G | ★ |
| H-J | Shout/Beat/Melody 割合 |
| K | ノーツ数 |
| L | 秒数 |
| M-R | 20ノーツまで (notes_20) Shout白/Shout色/Beat白/Beat色/Melody白/Melody色 |
| S-X | ライト2個 (light_2) |
| Y-AD | ライト3個 (light_3) ×1.1 |
| AE-AJ | ライト4個 (light_4) ×1.2 |
| AK-AP | ライト5個 (light_5) ×1.3 |
| AQ-AV | ライト6個 (light_6) ×1.5 |
| AW-BB | Chorus Light 5 (chorus_light_5) ×2.6 |
| BC-BH | Chorus Light 6 (chorus_light_6) ×3.0 |

スコア計算の `BA22-BA29 = FILTER('楽曲データ'!$M:$R, $S:$X, ...)` で参照。

## 12. 楽曲リストシート

A 列に曲名リストが並ぶ（4-ROAR, Ache, Ache, Anyway and everyway, … の順）。スコア計算の `D6` ドロップダウンの選択肢。

## 13. 固有ブローチシート

| 列 | 内容 |
| --- | --- |
| A | (内部 ID、`衣装データ!A` と一致) |
| B | cardID |
| C | cardname |
| D | name (キャラ名 or グループ名) |
| E | name_other |
| G | Shout |
| H | Beat |
| I | Melody |
| K | 属性 |
| L | アイドル |
| M | グループ |
| N | オート |
| O | 楽曲 |
| P | スコア |
| Q | 上限 (limit) |
| R | ブローチの種類 (1-9) |

**種類一覧（スコア計算 AM34 で参照）**:

| 値 | 名称 | 効果 |
| --- | --- | --- |
| 1 | 属性UP | Shout/Beat/Melody 常時加算 |
| 2 | アイドル指定 | カードのキャラと `L` 列が一致すれば加算 |
| 3 | 属性カウント | 対象属性 (`K` 列) のカード数 × 加算値 |
| 4 | グループ指定 | 自デッキが全員同じグループなら加算 |
| 5 | アイドル属性指定カウント | アイドル × 属性のカード数 × 加算値 |
| 6 | 属性UP（上限型） | 上限枚数 `Q` までデッキで発動 |
| 7 | 全属性存在 | デッキに Shout/Beat/Melody 全部あれば加算 |
| 8 | オート限定 | スコア計算では使われない |
| 9 | スコアUP | 楽曲 `O` 列と曲名一致で **属性値ではなくスコア直接加算** |

## 14. 計算フロー要約

```text
[入力]
  楽曲: D4/D5/D6 → AQ4 (楽曲 ID)
  カード: H8/H9/H10/H11 → AM9 (衣装 ID) × 6 スロット
  オプション: I6 (アシスト), K6 (バッジ), B12/B13/C14/B15/B16 (各種フル発動/確率UP)

[チーム属性値]
  AM16:AM18  衣装 raw 属性値
  AM25:AM27  特訓判定後 (sp_time × sp_value を差し引く/保持)
  AM29:AM31  特効倍率適用 (ROUND)
  AM37:AM39  固定ブローチ属性値加算 (種類 1-7)
  AM44:AM46  共有ブローチ① 属性値加算
  AM52:AM54  共有ブローチ② 属性値加算
  AM58:AM60  ブローチ合計
  AM63:AM65  基底 + ブローチ (per slot)
  AN67-AP67-AR67  自デッキ属性値合計 (Shout/Beat/Melody)
  + AU26:AW26  ラビットノート (キャラフラグ和)
  AN68-AP68-AR68  ラビットノート加算後
  + AR63:AR65  フレンドスロット加算
  AN69-AP69-AR69  デッキ属性値合計
  × (1 + センター + フレンド = 1.2 if Beat+Beat等)
  AN71-AP71-AR71  センタースキル発動 (ROUNDDOWN)
  × 1.2 if assist
  AN72-AP72-AR72  アシスト後 appeal

[属性値スコア]
  BA11:BF17  per-note 素点 (floor(appeal × 2.5% or 3%) × ライト倍率で再 floor)
  BA22:BF29  楽曲ノート数 (FILTER from 楽曲データ)
  BI11:BN18  per-note × ノート数 (行 11-18 × 列 BI-BN)
  BN21       = SUM(BI11:BN18)                       ← 属性値スコア

[スコアアップスキル期待値]
  H38:M38    per card ROUNDDOWN(denom/count × per/100 × value)
  D21        = SUM(H38:M38)

[縮小スキル期待値]
  H39:M39    per card 期待縮小秒数 ROUNDDOWN(denom/count × per/100 × value)
  M6         = SUM(H39:M39) / D9                    ← カバー率（100% 超可）
  BN22       = if assist, ROUNDDOWN(BN21/1.2), else BN21   ← 基準 (unassisted)
  BN23       = BN22 相当、行 11 除外版
  H40:M40    per card 縮小スコア (coverage 100% 未満/以上で分岐)
  D22        = SUM(H40:M40)

[最終]
  D23 = D20 + D21 + D22                             ← ライブ終了時
  D24 = if badge, ROUNDDOWN(D23 × (1 + 16%)), else D23  ← 最終リザルト
```

## 15. v1.0.5 で観察された不整合・バグ候補

| # | 箇所 | 内容 | 影響 |
| --- | --- | --- | --- |
| 1 | `BA11` | 本来 `=ROUNDDOWN($AN72*2.5%)` のはずが `TRUE` リテラル | Shout 白 notes_20 / light_2 帯の per-note が常に 1 相当 → `BN21` が過小（Shout 白ノート数 × (真値 − 1) 分） |
| 2 | `BA12:BA17` vs `BA11` | BA12 以降は BA11 を参照するため、BA11 バグに連鎖して Shout 白 light_3 〜 chorus_light_6 も壊れる | 上記と合わせて Shout 白の全ライト帯で過小 |
| 3 | `BI12 = BA11*BA23` | 通常であれば BA12*BA23 のはずだが、実測値は BA11 参照 | BI 列の一部スキームが不明瞭、要再調査 |
| 4 | センター/フレンド率 10% 固定 | `AN71` が `IF($J20="Shout", 0.1, 0)` とリテラル | レアリティ別（UR=10/SSR=7/他=6）に対応していない。UR × UR の場合のみ実態と合う |
| 5 | `v1.0.5` 表示 | シート名が「アイナナスコア計算 **v1.0.5**」だが更新履歴最終項は `v1.0.1`（`v1.0.2-1.0.4` の記載が欠損している可能性） | 採取時点の CSV では明確な v1.0.2-1.0.4 の行が確認できず |

## 16. 再調査時の効率的な採取手順

本書のデータは以下の手順で短時間に再取得できる:

### 16-1. シートの評価済み値（CSV）を一括ダウンロード

```bash
for sheet in "スコア計算" "設定" "楽曲データ" "楽曲リスト" "固有ブローチ" "衣装データ" "ブローチ登録" "所有カード登録" "イベント集計" "使い方" "更新履歴" "メモ"; do
  enc=$(printf '%s' "$sheet" | python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read()))")
  curl -s "https://docs.google.com/spreadsheets/d/1St4Hf609y9FobAn6-UjDIbkzDedo4Bssl5HT7PalFRk/gviz/tq?tqx=out:csv&sheet=$enc" \
    > "/tmp/sheet_${sheet}.csv"
done
```

### 16-2. 数式の採取（playwright 経由）

Google Sheets はセルの数式をそのままには API 公開していないため、UI の名前ボックスから数式バーを読む方式を取る:

```javascript
// playwright MCP の mcp__playwright__browser_evaluate に渡す関数
async () => {
  async function readCell(ref) {
    const nb = document.querySelector('#t-name-box');
    nb.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(nb, ref);
    nb.dispatchEvent(new Event('input', { bubbles: true }));
    nb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    nb.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', keyCode: 13, bubbles: true }));
    await new Promise(r => setTimeout(r, 130));   // 130ms で数式バーが更新される
    const fb = document.querySelector('#t-formula-bar-input');
    return fb ? (fb.textContent || fb.innerText || '').trim() : '';
  }
  const cells = ['D24', 'D23', 'D22', 'D21', 'D20', 'M6', 'BN21', 'BN22', 'BN23',
                 'H38', 'H39', 'H40', 'H31', 'H33', 'H34', 'H35', 'H36', 'H37',
                 'AN68', 'AN69', 'AN71', 'AN72', 'AN60', 'AN63', 'AN67',
                 'AM9', 'AM14', 'AM28', 'AM37', 'AM44', 'AM52', 'AU10', 'AU26',
                 "'設定'!B3", "'設定'!B6", "'設定'!C6"];
  const result = {};
  for (const c of cells) result[c] = await readCell(c);
  return result;
}
```

採取済みの主要数式は `docs/spreadsheet-score-calc-diff.md §8` に全掲載している。

### 16-3. 差分比較

`docs/spreadsheet-score-calc-diff.md` の各節をテンプレートとして、以下を確認:

1. `D24`・`BN21`・`BN22`・`BN23`・`M6`・`H40` が変更されているか
2. `'設定'!B3` (バッジ) / `'設定'!C6` (金特効) の値変更
3. 新たなブローチ種類の追加 (`固有ブローチ!R` 列の値範囲)
4. `BA11` の `TRUE` リテラルが修正されているか

## 17. 関連文書

- `docs/score_calc_spec.md` — i7 実装のスコア計算仕様書
- `docs/shrink-skill-spec.md` — i7 実装の縮小スキル仕様書
- `docs/broach_spec.md` — i7 実装のブローチ仕様書
- `docs/simulation-overview.md` — i7 実装の MC シミュレーション概要
- `docs/spreadsheet-score-calc-diff.md` — 本シートと i7 の差分比較（縮小スキル重点）
- `src/lib/score/engine.ts` — i7 の計算エンジン
- `src/lib/score/shrinkExclusion.ts` — 先頭除外ロジック
- `src/lib/score/broachResolver.ts` — ブローチ解決ロジック
