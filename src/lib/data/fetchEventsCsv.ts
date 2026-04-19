import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface EventRow {
  id: number;
  eventname: string;
  eventtype: string;
  start_date: string;
  end_date: string;
  special3_member: string;
  comment: string;
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

export async function fetchEventsCsv(): Promise<EventRow[]> {
  const csvPath = path.resolve(process.cwd(), 'public/events/events.csv');
  const text = await readFile(csvPath, 'utf-8');
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const header = rows[0];
  const idx = (name: string) => header.indexOf(name);
  const iId = idx('ID');
  const iName = idx('eventname');
  const iType = idx('eventtype');
  const iStart = idx('start_date');
  const iEnd = idx('end_date');
  const iMember = idx('special3_member');
  const iComment = idx('comment');

  return rows.slice(1).map(r => ({
    id: Number(r[iId] ?? 0),
    eventname: (r[iName] ?? '').trim(),
    eventtype: (r[iType] ?? '').trim(),
    start_date: (r[iStart] ?? '').trim(),
    end_date: (r[iEnd] ?? '').trim(),
    special3_member: (r[iMember] ?? '').trim(),
    comment: (r[iComment] ?? '').trim(),
  })).filter(e => e.id > 0 && e.eventname && e.start_date && e.end_date);
}
