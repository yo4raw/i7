import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface EventSpecialTier {
  cardIds: number[];
  costumeIds: number[];
  effect: string[];
  param_up: number;
  item_up: number;
  bpt_up: number;
  ept_up: number;
  gpt_up: number;
  score_up: number;
}

export interface EventRow {
  id: number;
  eventname: string;
  eventtype: string;
  start_date: string;
  end_date: string;
  special3_member: string;
  comment: string;
  gold: EventSpecialTier;
  silver: EventSpecialTier;
  bronze: EventSpecialTier;
}

function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let cur = '';
  let row: string[] = [];
  let inQuote = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuote) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuote = true;
      } else if (c === ',') {
        row.push(cur);
        cur = '';
      } else if (c === '\n') {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = '';
      } else if (c === '\r') {
        // handled by \n
      } else {
        cur += c;
      }
    }
  }
  if (cur !== '' || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

function parseIdList(s: string): number[] {
  return (s || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => Number(x))
    .filter(n => Number.isFinite(n) && n > 0);
}

function parseEffectList(s: string): string[] {
  return (s || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

function toNum(s: string): number {
  const n = Number((s || '').trim());
  return Number.isFinite(n) ? n : 0;
}

export async function fetchEventsCsv(): Promise<EventRow[]> {
  const csvPath = path.resolve(process.cwd(), 'public/events/events.csv');
  const text = await readFile(csvPath, 'utf-8');
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const header = rows[0];
  const col = (name: string) => header.indexOf(name);

  const iId = col('ID');
  const iName = col('eventname');
  const iType = col('eventtype');
  const iStart = col('start_date');
  const iEnd = col('end_date');
  const iMember = col('special3_member');
  const iComment = col('comment');

  function readTier(r: string[], n: 1 | 2 | 3): EventSpecialTier {
    return {
      cardIds: parseIdList(r[col(`special${n}_rID`)] ?? ''),
      costumeIds: parseIdList(r[col(`special${n}_ID`)] ?? ''),
      effect: parseEffectList(r[col(`special${n}_effect`)] ?? ''),
      param_up: toNum(r[col(`special${n}_param_up`)] ?? ''),
      item_up: toNum(r[col(`special${n}_item_up`)] ?? ''),
      bpt_up: toNum(r[col(`special${n}_bpt_up`)] ?? ''),
      ept_up: toNum(r[col(`special${n}_ept_up`)] ?? ''),
      gpt_up: toNum(r[col(`special${n}_gpt_up`)] ?? ''),
      score_up: toNum(r[col(`special${n}_score_up`)] ?? ''),
    };
  }

  return rows.slice(1).map(r => ({
    id: Number(r[iId] ?? 0),
    eventname: (r[iName] ?? '').trim(),
    eventtype: (r[iType] ?? '').trim(),
    start_date: (r[iStart] ?? '').trim(),
    end_date: (r[iEnd] ?? '').trim(),
    special3_member: (r[iMember] ?? '').trim(),
    comment: (r[iComment] ?? '').trim(),
    gold: readTier(r, 1),
    silver: readTier(r, 2),
    bronze: readTier(r, 3),
  })).filter(e => e.id > 0 && e.eventname && e.start_date && e.end_date);
}

const EFFECT_LABEL: Record<string, string> = {
  param: 'パラメータ',
  item: 'アイテム',
  bpt: '基礎Pt',
  ept: 'イベントPt',
  gpt: 'グレードPt',
  score: 'スコア',
};

export function formatEffectSummary(tier: EventSpecialTier): string {
  const parts: string[] = [];
  const map: Array<[string, number]> = [
    ['param', tier.param_up],
    ['item', tier.item_up],
    ['bpt', tier.bpt_up],
    ['ept', tier.ept_up],
    ['gpt', tier.gpt_up],
    ['score', tier.score_up],
  ];
  for (const [key, v] of map) {
    if (v > 0 && tier.effect.includes(key)) {
      parts.push(`${EFFECT_LABEL[key] ?? key} +${v}%`);
    }
  }
  return parts.join(' / ');
}
