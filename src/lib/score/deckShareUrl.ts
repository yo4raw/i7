/**
 * 編成シェア URL の encode / decode。
 *
 * `ScoreCalc.svelte` の buildStateObject() / applyState() と
 * 同じ 6 フィールド（songId / deckIds / bonusTiers / trained /
 * sharedBroachs / skillLevels）を URLSearchParams にシリアライズする。
 *
 * 仕様 (v1):
 *   dv     = 1
 *   song   = number （省略可）
 *   cards  = "a.b.c.d.e.f"   (0 = 空スロット)
 *   tiers  = "g.s.n.n.b.n"   (g/s/b/n = gold/silver/bronze/none)
 *   tr     = "111110"        (1=特訓済, 0=未特訓)
 *   lv     = "555543"        (1〜5)
 *   sb     = "1,2_3___4,5_"  (_ でスロット区切り、, で配列内区切り)
 */

export type BonusTier = 'none' | 'bronze' | 'silver' | 'gold';

export type DeckShareState = {
  songId: number | null;
  deckIds: (number | null)[];
  bonusTiers: BonusTier[];
  trained: boolean[];
  sharedBroachs: number[][];
  skillLevels: number[];
};

const VERSION = 1;
const SLOTS = 6;

const TIER_TO_CHAR: Record<BonusTier, string> = {
  gold: 'g',
  silver: 's',
  bronze: 'b',
  none: 'n',
};

const CHAR_TO_TIER: Record<string, BonusTier> = {
  g: 'gold',
  s: 'silver',
  b: 'bronze',
  n: 'none',
};

export function encodeDeckToParams(state: DeckShareState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('dv', String(VERSION));

  if (state.songId != null) params.set('song', String(state.songId));

  params.set(
    'cards',
    Array.from({ length: SLOTS }, (_, i) => state.deckIds[i] ?? 0).join('.')
  );

  params.set(
    'tiers',
    Array.from({ length: SLOTS }, (_, i) => TIER_TO_CHAR[state.bonusTiers[i] ?? 'none']).join('.')
  );

  params.set(
    'tr',
    Array.from({ length: SLOTS }, (_, i) => (state.trained[i] ? '1' : '0')).join('')
  );

  params.set(
    'lv',
    Array.from({ length: SLOTS }, (_, i) => {
      const lv = state.skillLevels[i];
      return lv >= 1 && lv <= 5 ? String(lv) : '5';
    }).join('')
  );

  params.set(
    'sb',
    Array.from({ length: SLOTS }, (_, i) => (state.sharedBroachs[i] ?? []).join(',')).join('_')
  );

  return params;
}

export function decodeParamsToDeck(params: URLSearchParams): Partial<DeckShareState> | null {
  if (params.get('dv') !== String(VERSION)) return null;

  const result: Partial<DeckShareState> = {};

  const song = params.get('song');
  if (song != null && song !== '') {
    const n = Number(song);
    if (Number.isFinite(n) && n > 0) result.songId = n;
  } else if (params.has('song')) {
    result.songId = null;
  }

  const cards = params.get('cards');
  if (cards != null) {
    const parts = cards.split('.');
    if (parts.length === SLOTS) {
      result.deckIds = parts.map(s => {
        const n = Number(s);
        return Number.isFinite(n) && n > 0 ? n : null;
      });
    }
  }

  const tiers = params.get('tiers');
  if (tiers != null) {
    const parts = tiers.split('.');
    if (parts.length === SLOTS) {
      result.bonusTiers = parts.map(c => CHAR_TO_TIER[c] ?? 'none');
    }
  }

  const tr = params.get('tr');
  if (tr != null && tr.length === SLOTS && /^[01]+$/.test(tr)) {
    result.trained = tr.split('').map(c => c === '1');
  }

  const lv = params.get('lv');
  if (lv != null && lv.length === SLOTS && /^[1-5]+$/.test(lv)) {
    result.skillLevels = lv.split('').map(c => Number(c));
  }

  const sb = params.get('sb');
  if (sb != null) {
    const slots = sb.split('_');
    if (slots.length === SLOTS) {
      result.sharedBroachs = slots.map(slot => {
        if (slot === '') return [];
        return slot
          .split(',')
          .map(s => Number(s))
          .filter(n => Number.isFinite(n) && n > 0);
      });
    }
  }

  return result;
}

export function buildShareUrl(state: DeckShareState, scoreCalcPageUrl: string): string {
  const params = encodeDeckToParams(state);
  return `${scoreCalcPageUrl}?${params.toString()}`;
}

export function isDeckEmpty(state: DeckShareState): boolean {
  if (state.songId != null) return false;
  return state.deckIds.every(id => id == null);
}
