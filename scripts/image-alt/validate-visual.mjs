/**
 * `src/data/image-visual.json` のカタログを検査する。
 *
 * 検査の順序と境界は設計書 5 章に固定されている
 * （網羅性 → 空 v → 長さ → 禁止語 → キャラクター名混入 → 構造）。
 * 検査対象はすべて引数で受け取る。ネットワークもファイル IO も読まない。
 */

/**
 * `src/lib/constants.ts` の `CHARACTERS`（全 16 名）から `百` / `千` を除いた 14 名。
 * `百` / `千` は一般語彙と衝突するためこの検査から外し、手動目視で確認する（設計書 5.5）。
 * 定数をハードコードしているのは、`.mjs` から `constants.ts` を import すると
 * 素の Node 実行時に TS 依存が入るため。等価性は `tests/unit/scripts/validateVisual.test.ts` が担保する。
 */
export const LEAK_CHECK_NAMES = [
  '和泉一織', '二階堂大和', '和泉三月', '四葉環',
  '逢坂壮五', '六弥ナギ', '七瀬陸',
  '八乙女楽', '九条天', '十龍之介',
  '亥清悠', '狗丸トウマ', '棗巳波',
  '御堂虎於',
];

/** 禁止語。`g` を付けないのは `String#match` で状態が共有されるのを避けるため */
const FORBIDDEN_WORDS = /TODO|placeholder|画像|不明|[?？]/;

/** 強制境界。生成の目標長 40〜70 文字は検査しない（設計書 5.3） */
const MIN_LENGTH = 10;
const MAX_LENGTH = 200;

/** 連想配列（`null` と配列は除くオブジェクト）かどうか */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 1 レコードの違反を文字列の配列で返す。違反が無ければ `[]`。
 * メッセージはいずれも違反したレコードの `id` を含む。
 * @param {{ v?: unknown, n?: unknown }} record カタログの 1 エントリ
 * @param {'card' | 'song'} kind
 * @param {string} id
 * @returns {string[]}
 */
export function validateEntry(record, kind, id) {
  const violations = [];
  const prefix = `${kind} ${id}`;
  const v = typeof record?.v === 'string' ? record.v : '';

  if (v === '') {
    // 空 v は長さ・禁止語・名前混入の検査対象にできない。違反は 1 件だけ積む（設計書 5.2）
    violations.push(`${prefix}: v が空です（再投の対象）`);
  } else {
    if (v.length < MIN_LENGTH) {
      violations.push(`${prefix}: v が ${v.length} 文字で短すぎます（${MIN_LENGTH} 文字未満）`);
    }
    if (v.length > MAX_LENGTH) {
      violations.push(`${prefix}: v が ${v.length} 文字で長すぎます（${MAX_LENGTH} 文字超）`);
    }

    const forbidden = v.match(FORBIDDEN_WORDS)?.[0];
    if (forbidden) {
      violations.push(`${prefix}: 禁止語「${forbidden}」を含んでいます`);
    }

    const leaked = LEAK_CHECK_NAMES.find((name) => v.includes(name));
    if (leaked) {
      violations.push(`${prefix}: キャラクター名「${leaked}」が混入しています`);
    }
  }

  // 構造（設計書 5.6）。`n` は任意。ただし string で、シートに行が無いカード（`cards` 側）しか持てない
  if (record?.n !== undefined && record.n !== null) {
    if (typeof record.n !== 'string') {
      violations.push(`${prefix}: n が string ではありません（${typeof record.n}）`);
    } else if (kind !== 'card') {
      violations.push(`${prefix}: n は cards 側にしか持てません`);
    }
  }

  return violations;
}

/**
 * カタログ全体の違反を文字列の配列で返す。違反が無ければ `[]`。
 * @param {{ cards?: unknown, songs?: unknown }} catalog
 * @param {{ cardIds: string[], songIds: string[] }} ids 実画像から採った ID 集合
 * @returns {string[]}
 */
export function validateCatalog(catalog, { cardIds, songIds }) {
  const violations = [];

  for (const [kind, scope, ids] of [
    ['card', 'cards', cardIds],
    ['song', 'songs', songIds],
  ]) {
    const entries = catalog[scope];
    if (!isRecord(entries)) {
      // 構造崩れのときは配下の網羅性・エントリ検査を打ち切る（違反が連鎖して騒ぐだけ）
      violations.push(`${scope}: ID を格納するオブジェクトではありません`);
      continue;
    }

    // 網羅性（設計書 5.1）。実画像側とカタログ側の ID 集合を双方向で突き合わせる
    const expected = new Set(ids);
    for (const id of Object.keys(entries)) {
      if (!expected.has(id)) {
        violations.push(`${scope} ${id}: 実画像に無い ID がカタログに残っている`);
      }
    }
    for (const id of expected) {
      if (!Object.hasOwn(entries, id)) {
        violations.push(`${scope} ${id}: 実画像にある ID がカタログに無い`);
      }
    }

    for (const [id, entry] of Object.entries(entries)) {
      violations.push(...validateEntry(entry, kind, id));
    }
  }

  return violations;
}
