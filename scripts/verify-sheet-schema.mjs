/**
 * スプレッドシートの列ヘッダーがコードの列マッピングと一致するか検証する。
 *
 * 背景: 2026-09 に fetchSongsJson / fetchFixedBroachsJson が誤った
 * スプレッドシート ID を参照し、存在しない gid 指定時に GViz が
 * 先頭シート（衣装データ）を返すため、列がずれたまま壊れたデータが
 * 本番へ配信された。
 *
 * このスクリプトは各データソースの GViz レスポンスから列ラベルを取得し、
 * コード側の列マッピングが期待するラベルと一致するか検証する。
 * 失敗時は exit 1（CI のビルド前ゲートとして使用）。
 *
 * 実行: node scripts/verify-sheet-schema.mjs
 */

// 衣装（カード）データのスプレッドシート（gviz.ts の SPREADSHEET_ID と同一）
const CARD_SPREADSHEET_ID = '1LifgqDiRlQOIhP8blqEngJhI_Nnagbo8uspwmfg72fY';
// 楽曲・固有ブローチのマスタースプレッドシート（fetchSongsJson.ts /
// fetchFixedBroachsJson.ts の定数と同一）
const SONG_BROACH_SPREADSHEET_ID = '1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4';

/**
 * 検証ルール: { name, spreadsheetId, gid, expected, minRows }
 * expected: { colIndex: RegExp } — その列が持つべきラベル。
 * 全列ではなく、識別に十分な代表列だけを見る。
 */
const SHEETS = [
  {
    name: 'cards (衣装データ)',
    spreadsheetId: CARD_SPREADSHEET_ID,
    gid: 480354522,
    expected: {
      0: /^ID$/,
      1: /^cardID$/,
      2: /^cardname$/,
      10: /^attribute$/,
      17: /^ap_skill_type$/,
      20: /^ap_skill_1_count$/,
    },
    minRows: 100,
  },
  {
    name: 'songs (楽曲データ)',
    spreadsheetId: SONG_BROACH_SPREADSHEET_ID,
    gid: 1083871743,
    expected: {
      0: /^ID$/,
      1: /^分類$/,
      2: /アーティスト/,
      3: /^曲名$/,
      5: /^難易度$/,
      10: /ノーツ数/,
      11: /秒数/,
      66: /データ更新日/,
    },
    minRows: 50,
  },
  {
    name: 'fixed broachs (固有ブローチ)',
    spreadsheetId: SONG_BROACH_SPREADSHEET_ID,
    gid: 1087762308,
    // fetchFixedBroachsJson.ts の headerOverrides に対応する生ラベル:
    // 0:ID, 1:cardID, 2:cardname, 6:Shout, 7:Beat, 8:Melody,
    // 10:属性, 11:アイドル, 12:グループ, 13:オート, 14:楽曲, 15:スコア,
    // 16:上限, 17:ブローチの種類
    expected: {
      0: /^ID$/,
      1: /^cardID$/,
      2: /^cardname$/,
      6: /^Shout$/,
      10: /^属性$/,
      14: /^楽曲$/,
      17: /ブローチの種類/,
    },
    minRows: 10,
  },
];

function gvizUrl(spreadsheetId, gid) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
}

async function fetchTable(spreadsheetId, gid) {
  const res = await fetch(gvizUrl(spreadsheetId, gid), {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  const m = text.match(/google\.visualization\.Query\.setResponse\((.+)\);?\s*$/s);
  if (!m) {
    throw new Error('GViz レスポンスのパースに失敗');
  }
  const data = JSON.parse(m[1]);
  if (data.status !== 'ok') {
    const detail = (data.errors ?? []).map((e) => e.detailed_message ?? e.message).join('; ');
    throw new Error(`GViz status=${data.status}${detail ? `: ${detail}` : ''}`);
  }
  return data.table;
}

async function verifySheet(sheet) {
  const table = await fetchTable(sheet.spreadsheetId, sheet.gid);
  const errors = [];

  if (table.rows.length < sheet.minRows) {
    errors.push(
      `行数が不足: ${table.rows.length} 行 (最低 ${sheet.minRows} を期待)。` +
        'gid が別シートを指している可能性があります',
    );
  }

  for (const [colIdx, pattern] of Object.entries(sheet.expected)) {
    const col = table.cols[Number(colIdx)];
    const label = col?.label ?? '';
    if (!pattern.test(label)) {
      errors.push(`列 ${colIdx} のラベル不一致: 期待 ${pattern}, 実際 "${label}"`);
    }
  }

  return errors;
}

async function main() {
  console.log('スプレッドシートのスキーマ検証を開始します…\n');
  let failed = false;

  for (const sheet of SHEETS) {
    try {
      const errors = await verifySheet(sheet);
      if (errors.length === 0) {
        console.log(`✅ ${sheet.name} (gid=${sheet.gid}): OK`);
      } else {
        failed = true;
        console.error(`❌ ${sheet.name} (gid=${sheet.gid}):`);
        for (const e of errors) console.error(`   - ${e}`);
      }
    } catch (e) {
      failed = true;
      console.error(`❌ ${sheet.name} (gid=${sheet.gid}): フェッチ失敗 - ${e.message}`);
    }
  }

  if (failed) {
    console.error(
      '\nスプレッドシートのスキーマ検証に失敗しました。' +
        'コード側の spreadsheetId / gid、またはシート側の列構成変更を確認してください。',
    );
    process.exit(1);
  }
  console.log('\nすべてのスプレッドシートのスキーマが正常です。');
}

await main();
