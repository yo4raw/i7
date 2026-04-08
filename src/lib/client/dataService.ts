/**
 * Client-side data fetching + localStorage caching service.
 *
 * Replaces the build-time fetch*.js modules.
 * Each getter checks localStorage first (TTL: 1 hour),
 * then falls back to fetching from the Google Sheets GViz API.
 */

const SPREADSHEET_ID = '1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4';
const CARDS_GID = 480354522;
const SONGS_GID = 1083871743;
const BROACHS_GID = 1087762308;

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// GViz helpers
// ---------------------------------------------------------------------------

function extractCellValue(cell: any): any {
  if (!cell || cell.v === null || cell.v === undefined) return null;
  const v = cell.v;
  if (typeof v === 'string' && /^Date\(\d+,\d+,\d+/.test(v)) {
    const m = v.match(/Date\((\d+),(\d+),(\d+)/);
    if (m) return new Date(Number(m[1]), Number(m[2]), Number(m[3])).toISOString().split('T')[0];
  }
  return v;
}

function parseGvizResponse(text: string): any {
  const match = text.match(/google\.visualization\.Query\.setResponse\((.+)\);?\s*$/s);
  if (!match) throw new Error('GViz JSONレスポンスのパースに失敗しました');
  return JSON.parse(match[1]);
}

async function fetchGviz(gid: number): Promise<any> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`スプレッドシートの取得に失敗: ${res.status}`);
  return parseGvizResponse(await res.text());
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { timestamp: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage full — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

async function fetchCards(): Promise<any[]> {
  const gviz = await fetchGviz(CARDS_GID);
  const table = gviz.table;
  const headers: string[] = table.cols.map((col: any, i: number) => col.label || `column_${i}`);
  return table.rows.map((row: any) => {
    const obj: any = {};
    headers.forEach((header, i) => {
      if (header.startsWith('column_')) return;
      const cell = row.c ? row.c[i] : null;
      obj[header] = extractCellValue(cell);
    });
    return obj;
  });
}

let cardsPromise: Promise<any[]> | null = null;

export function getCards(): Promise<any[]> {
  if (cardsPromise) return cardsPromise;
  const cached = readCache<any[]>('i7_cache_cards');
  if (cached) return Promise.resolve(cached);
  cardsPromise = fetchCards().then((data) => {
    writeCache('i7_cache_cards', data);
    cardsPromise = null;
    return data;
  });
  return cardsPromise;
}

// ---------------------------------------------------------------------------
// Songs
// ---------------------------------------------------------------------------

const FLAT_COLUMNS: Record<number, string> = {
  0: 'id', 1: 'category', 2: 'artist', 3: 'song_name', 4: 'song_type',
  5: 'difficulty', 6: 'stars', 7: 'shout_ratio', 8: 'beat_ratio',
  9: 'melody_ratio', 10: 'notes_count', 11: 'duration',
};

const NESTED_GROUPS: Record<number, string> = {
  12: 'notes_20', 18: 'light_2', 24: 'light_3', 30: 'light_4',
  36: 'light_5', 42: 'light_6', 48: 'chorus_light_5', 54: 'chorus_light_6',
};

const SUB_KEYS = [
  'shout_white', 'shout_color', 'beat_white', 'beat_color', 'melody_white', 'melody_color',
];

const TOTAL_COLUMNS: Record<number, string> = {
  60: 'total_shout_white', 61: 'total_shout_color',
  62: 'total_beat_white', 63: 'total_beat_color',
  64: 'total_melody_white', 65: 'total_melody_color',
};

function convertSongRow(cells: any[]): any {
  const obj: any = {};
  for (const [col, key] of Object.entries(FLAT_COLUMNS)) {
    let val = extractCellValue(cells[Number(col)] ?? null);
    if (key === 'stars' && typeof val === 'string') val = val.length;
    obj[key] = val;
  }
  for (const [startCol, groupKey] of Object.entries(NESTED_GROUPS)) {
    const group: any = {};
    const start = Number(startCol);
    SUB_KEYS.forEach((subKey, i) => {
      group[subKey] = extractCellValue(cells[start + i] ?? null) ?? 0;
    });
    obj[groupKey] = group;
  }
  for (const [col, key] of Object.entries(TOTAL_COLUMNS)) {
    obj[key] = extractCellValue(cells[Number(col)] ?? null);
  }
  obj.updated_at = extractCellValue(cells[66] ?? null);
  return obj;
}

async function fetchSongs(): Promise<any[]> {
  const gviz = await fetchGviz(SONGS_GID);
  return gviz.table.rows
    .map((row: any) => convertSongRow(row.c || []))
    .filter((row: any) => row.song_name != null);
}

let songsPromise: Promise<any[]> | null = null;

export function getSongs(): Promise<any[]> {
  if (songsPromise) return songsPromise;
  const cached = readCache<any[]>('i7_cache_songs');
  if (cached) return Promise.resolve(cached);
  songsPromise = fetchSongs().then((data) => {
    writeCache('i7_cache_songs', data);
    songsPromise = null;
    return data;
  });
  return songsPromise;
}

// ---------------------------------------------------------------------------
// Broachs
// ---------------------------------------------------------------------------

const BROACH_COLUMNS: Record<number, string> = {
  0: 'id', 1: 'card_id', 2: 'card_name', 3: 'name', 4: 'name_other',
  6: 'shout', 7: 'beat', 8: 'melody', 10: 'attribute', 11: 'idol',
  12: 'group', 13: 'auto', 14: 'song', 15: 'score', 16: 'limit', 17: 'broach_type',
};

async function fetchBroachs(): Promise<any[]> {
  const gviz = await fetchGviz(BROACHS_GID);
  return gviz.table.rows
    .map((row: any) => {
      const cells = row.c || [];
      const obj: any = {};
      for (const [col, key] of Object.entries(BROACH_COLUMNS)) {
        obj[key] = extractCellValue(cells[Number(col)] ?? null);
      }
      return obj;
    })
    .filter((row: any) => row.card_name != null);
}

let broachsPromise: Promise<any[]> | null = null;

export function getBroachs(): Promise<any[]> {
  if (broachsPromise) return broachsPromise;
  const cached = readCache<any[]>('i7_cache_broachs');
  if (cached) return Promise.resolve(cached);
  broachsPromise = fetchBroachs().then((data) => {
    writeCache('i7_cache_broachs', data);
    broachsPromise = null;
    return data;
  });
  return broachsPromise;
}
