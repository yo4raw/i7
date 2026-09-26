/**
 * 画像 alt テキストの合成。
 *
 * alt は「識別情報（誰の / 何の絵か） + ビジュアル描写」の順に並べる。
 * ビジュアル描写は `src/data/image-visual.json`（sub-agent が書いた絵の中身の描写カタログ）を
 * 受け取る形で、ここでは一切読まない。値の欠けはすべて空文字として扱い、
 * 括弧や区切りの句点は中身が空なら付けない。
 * import は葉モジュールのままにして、JSON をクライアントバンドルへ引き込まない。
 */

/** `image-visual.json` の 1 件。`n` はシートに対応行が無いカードの印字名。 */
export interface VisualEntry {
  v?: string | null;
  n?: string | null;
}

/** `cardAlt` に渡す衣装の最小フィールド */
export interface CardAltSource {
  name?: string | null;
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
 * @param card 衣装データ
 * @param entry ビジュアル描写のカタログ 1 件（無い / `v` が空でも識別情報だけの文字列を返す）
 */
export function cardAlt(card: CardAltSource, entry?: VisualEntry | null): string {
  const v = clean(entry?.v);
  const name = clean(card.name);
  if (!name) return v;

  const cardname = clean(card.cardname);
  const spec = [clean(card.rarity), clean(card.attribute)].filter(Boolean).join('・');
  const head = `${name}の${cardname ? `「${cardname}」` : ''}カードイラスト${spec ? `（${spec}）` : ''}`;
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
  if (!artist) return v;

  const songName = clean(song.song_name);
  return withVisual(`${artist}の楽曲${songName ? `「${songName}」` : ''}ジャケット`, v);
}

/**
 * シートに対応行が無いカードの alt を合成する。
 * キャラクター名を alt に出せないため、絵に印字されていた名前（`n`）で識別する。
 * @param entry ビジュアル描写のカタログ 1 件（`n` が無ければ描写のみを返す）
 */
export function orphanCardAlt(entry: VisualEntry): string {
  const v = clean(entry.v);
  const n = clean(entry.n);
  return withVisual(n ? `${n}のカードイラスト` : '', v);
}
