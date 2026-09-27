/**
 * 画像 alt テキストの合成。
 *
 * alt は「識別情報（どのカードか / どの楽曲か） + ビジュアル描写」の順に並べる。
 * 識別情報はカード名・レアリティ・属性・楽曲名など、シート由来の「何の絵か」の情報だけを
 * 使う。キャラクター名はここでは足さない。`v`（ビジュアル描写）の冒頭に既にキャラクター名が
 * 入っている前提で、単独人物のカードは `七瀬陸が…`、集合絵は `七瀬陸を含む7人が…` の形で
 * `src/data/image-visual.json` 側が持つ。
 *
 * ビジュアル描写は `image-visual.json` を受け取る形で、ここでは一切読まない。
 * 値の欠けはすべて空文字として扱い、括弧や区切りの句点は中身が空なら付けない。
 * import は葉モジュールのままにして、JSON をクライアントバンドルへ引き込まない。
 */

/** `image-visual.json` の 1 件。`n` はシートに対応行が無いカードの印字名（参考用）。 */
export interface VisualEntry {
  v?: string | null;
  n?: string | null;
}

/** `cardAlt` に渡す衣装の最小フィールド。`name` は alt には出さない */
export interface CardAltSource {
  cardname?: string | null;
  rarity?: string | null;
  attribute?: string | null;
}

/** `songAlt` に渡す楽曲の最小フィールド */
export interface SongAltSource {
  artist?: string | null;
  song_name?: string | null;
}

/** `null` / `undefined` / string 以外 / 前後空白のみなら空文字にする */
function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 識別情報の後ろに描写を足す。識別情報が無ければ描写のみ、描写が無ければ識別情報のみを返す */
function withVisual(head: string, v: string): string {
  if (!head) return v;
  return v ? `${head}。${v}` : head;
}

/**
 * カード画像の alt を合成する。
 * キャラクター名は `v` の冒頭が持つため、ここでは「何の絵か」（カード名・レアリティ・属性）だけを出す。
 * @param card 衣装データ
 * @param entry ビジュアル描写のカタログ 1 件（無い / `v` が空でも識別情報だけの文字列を返す）
 */
export function cardAlt(card: CardAltSource, entry?: VisualEntry | null): string {
  const v = clean(entry?.v);
  const cardname = clean(card.cardname);
  const spec = [clean(card.rarity), clean(card.attribute)].filter(Boolean).join('・');
  const head = `${cardname ? `「${cardname}」` : ''}カードイラスト${spec ? `（${spec}）` : ''}`;
  return withVisual(head, v);
}

/**
 * 楽曲ジャケット画像の alt を合成する。
 * @param song 楽曲データ
 * @param entry ビジュアル描写のカタログ 1 件（無い / `v` が空でも識別情報だけの文字列を返す）
 */
export function songAlt(song: SongAltSource, entry?: VisualEntry | null): string {
  const v = clean(entry?.v);
  const artist = clean(song.artist);
  const songName = clean(song.song_name);
  return withVisual(`${artist ? `${artist}の` : ''}楽曲${songName ? `「${songName}」` : ''}ジャケット`, v);
}

/**
 * シートに対応行が無いカードの alt を合成する。
 * カード名が無いため、印字名（`n`）を参考情報として前に置く。
 * `v` の冒頭にも日本語名が入っているので、本文側では名前が繰り返される。
 * @param entry ビジュアル描写のカタログ 1 件（`n` が無ければ描写のみを返す）
 */
export function orphanCardAlt(entry: VisualEntry): string {
  const v = clean(entry.v);
  const n = clean(entry.n);
  return withVisual(n ? `${n}のカードイラスト` : 'カードイラスト', v);
}
