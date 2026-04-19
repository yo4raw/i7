# events.csv — イベントDB

`events.csv` は IDOLiSH7 (アイドリッシュセブン) のゲーム内イベント情報を収録した CSV データである。

## ソースと更新

- **取得元**: [i7.step-on-dream.net](https://i7.step-on-dream.net/admin/index.php) の「イベントDBをダウンロード(utf8)」
- **エンドポイント**: `POST https://i7.step-on-dream.net/admin/download.php` (`db=event&code=utf8`)
- **更新頻度**: 毎朝 JST 04:00 (GitHub Actions `.github/workflows/fetch-event-db.yml`)
- **公開 URL**: `https://yo4raw.github.io/i7/events/events.csv`
- **更新フロー**: 差分がある日のみ `auto/update-event-db` ブランチに PR が自動作成される

## フォーマット

- **エンコーディング**: UTF-8 (BOM 付き、`\uFEFF`)
- **区切り文字**: カンマ (`,`)
- **クォート**: 全フィールドをダブルクォートで囲む
- **改行**: LF
- **行構成**: 1 行目がヘッダー、2 行目以降がデータ

## 特効の 3 段階

各イベントには **金 / 銀 / 銅** の 3 段階の特効 (特攻) が定義される。カラム名の `special1` / `special2` / `special3` はこの 3 段階に対応する。

| カラム接頭辞 | 特効ランク |
|:---:|:---:|
| `special1_*` | 金特効 |
| `special2_*` | 銀特効 |
| `special3_*` | 銅特効 |

特効ランクごとの UP 率や対象カード数はイベントごとに異なる。具体的な値は各イベント行の `special{N}_*_up` / `special{N}_ID` カラムを参照。

## 効果種別 (effect)

`special{N}_effect` カラムにはその段階で有効な効果種別がカンマ区切りで列挙される。各効果の正確な意味は親サイトのイベント詳細ページ (`event.php?ID=X&view=detail`) の日本語表記から確認した。

| effect | 日本語表記 | 対応カラム |
|:---:|:---|:---|
| `param` | ユニットのパラメータ UP | `special{N}_param_up` |
| `item` | イベントアイテム獲得数 UP | `special{N}_item_up` |
| `bpt` | 基礎Pt 獲得量 UP | `special{N}_bpt_up` |
| `ept` | イベントPt 獲得量 UP | `special{N}_ept_up` |
| `gpt` | グレードPt 獲得量 UP | `special{N}_gpt_up` |
| `score` | スコア UP | `special{N}_score_up` |

数値は **% 表記のアップ率**。例: `100` は +100% (元値の 2 倍)。

## イベント種別 (eventtype)

| 値 | 主に使われる効果 |
|:---|:---|
| ハイスコアライブイベント | `param` / `item` / `gpt` |
| ポイントライブイベント | `param` / `item` / `bpt` |
| ポイントミッションイベント | `item` / `gpt` |
| ミッションイベント | (イベント毎に異なる) |
| ループイベント | `item` / `ept` |

## カラム定義 (全 44 列)

### 基本情報

| # | カラム名 | 型 | 説明 |
|---:|:---|:---|:---|
| 1 | `ID` | int | イベント ID (ユニークキー、親サイトの `event.php?ID=...` と対応) |
| 2 | `eventname` | string | イベント名 |
| 3 | `eventtype` | string | イベント種別 (上表参照) |

### 開催期間

| # | カラム名 | 型 | 説明 |
|---:|:---|:---|:---|
| 4-7 | `start_year` / `start_month` / `start_day` / `start_date` | int / int / int / string | 開始日。`start_date` は `YYYY-MM-DD` 形式 |
| 8-11 | `end_year` / `end_month` / `end_day` / `end_date` | int / int / int / string | 終了日。`end_date` は `YYYY-MM-DD` 形式 |
| 12-14 | `kokan_year` / `kokan_month` / `kokan_day` | int | 景品交換 (こうかん) 期限。現データは全イベントで `0` (未使用) |

### 特効 (金=special1 / 銀=special2 / 銅=special3)

各段階につき同じ構造のカラムが 9 種存在する。以下は 1 段階分の定義 (`N` は 1〜3)。

| # (N=1 の例) | カラム名 | 型 | 説明 |
|---:|:---|:---|:---|
| 15 | `special{N}_effect` | string | 有効な効果種別のカンマ区切りリスト (例: `"param,item,bpt"`)。該当段階で UP 値が 0 より大きい effect のみ列挙される |
| 16 | `special{N}_ID` | string | 特効対象のカード ID のカンマ区切りリスト |
| 42-44 | `special{N}_rID` | string | 特効対象の衣装シリーズ ID のカンマ区切りリスト |
| 17 | `special{N}_param_up` | int (%) | パラメータ UP 率 |
| 18 | `special{N}_gpt_up` | int (%) | グレード Pt 獲得量 UP 率 |
| 19 | `special{N}_item_up` | int (%) | イベントアイテム獲得数 UP 率 |
| 20 | `special{N}_score_up` | int (%) | スコア UP 率 (現データでは全件 0) |
| 35-37 | `special{N}_bpt_up` | int (%) | 基礎 Pt 獲得量 UP 率 |
| 38-40 | `special{N}_ept_up` | int (%) | イベント Pt 獲得量 UP 率 |

実際の CSV ではこれらが `special1_* → special2_* → special3_*` の順にフラットに並んでいる。ただし `bpt_up` / `ept_up` / `rID` は後から追加された経緯で、CSV 末尾側にまとめて配置されている (後述の全カラム順参照)。

### その他

| # | カラム名 | 型 | 説明 |
|---:|:---|:---|:---|
| 33 | `special3_member` | string | 銅特効の対象グループ名 (例: `IDOLiSH7`, `TRIGGER`, `Re:vale`, `ŹOOĻ`) または複数メンバー名の組み合わせ。銅特効は「対象メンバーのカードすべて」のように広く指定されるため、個別 ID ではなくグループ名で表現されることが多い |
| 34 | `comment` | string | 備考 (現データでは全件空) |
| 41 | `listview` | int | リスト表示フラグ (現データでは全件 0) |

### CSV 上の全カラム順 (参考)

```
1. ID
2. eventname
3. eventtype
4. start_year       5. start_month      6. start_day       7. start_date
8. end_year         9. end_month       10. end_day        11. end_date
12. kokan_year     13. kokan_month     14. kokan_day
15. special1_effect  16. special1_ID   17. special1_param_up  18. special1_gpt_up  19. special1_item_up  20. special1_score_up
21. special2_effect  22. special2_ID   23. special2_param_up  24. special2_gpt_up  25. special2_item_up  26. special2_score_up
27. special3_effect  28. special3_ID   29. special3_param_up  30. special3_gpt_up  31. special3_item_up  32. special3_score_up
33. special3_member
34. comment
35. special1_bpt_up  36. special2_bpt_up  37. special3_bpt_up
38. special1_ept_up  39. special2_ept_up  40. special3_ept_up
41. listview
42. special1_rID     43. special2_rID     44. special3_rID
```

## サンプル (先頭イベント)

```csv
"ID","eventname","eventtype","start_date","end_date",...,"special1_effect","special1_ID","special1_param_up","special1_item_up",...
"2","Re:vale記念日2021","ハイスコアライブイベント","2021-04-15","2021-04-21",...,"param,gpt,item","1487,1488,1489,1490","100","30",...
```

イベント ID=2 は:
- 金特効: カード 1487〜1490 に対してパラメータ +100% / グレードPt +50% / アイテム +30%
- 銀特効: 17 枚のカードに対してパラメータ +50% / グレードPt +30% / アイテム +20%
- 銅特効: Re:vale メンバーのカード全般に対してパラメータ +10% / グレードPt +10% / アイテム +10%

## 関連ファイル

| ファイル | 役割 |
|:---|:---|
| `.github/workflows/fetch-event-db.yml` | 自動取得ワークフロー |
| `src/lib/data/eventBonusTiers.ts` | 金/銀/銅特効の UI ラベル・表示スタイル定義 |
