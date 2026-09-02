#!/usr/bin/env node
/**
 * コミットメッセージが gitmoji 規約 (ADR 0066) に従っているか検証する。
 *
 * 件名の書式: `<gitmoji> <日本語の説明>`
 *   例: `✨ イベント詳細に対象楽曲セクションを追加する`
 *
 * `.husky/commit-msg` から `node scripts/check-commit-msg.mjs "$1"` で呼ばれる。
 * 外部依存を持たないので husky 以外のインストールは不要。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * gitmoji 公式 (https://gitmoji.dev) の絵文字一覧。
 * 異体字セレクタ (U+FE0F) は照合時に無視するため、付いていても外れていても通る。
 */
export const GITMOJIS = [
  '🎨', '⚡️', '🔥', '🐛', '🚑️', '✨', '📝', '🚀', '💄', '🎉',
  '✅', '🔒️', '🔐', '🔖', '🚨', '🚧', '💚', '⬇️', '⬆️', '📌',
  '👷', '📈', '♻️', '➕', '➖', '🔧', '🔨', '🌐', '✏️', '💩',
  '⏪️', '🔀', '📦️', '👽️', '🚚', '📄', '💥', '🍱', '♿️', '💡',
  '🍻', '💬', '🗃️', '🔊', '🔇', '👥', '🚸', '🏗️', '📱', '🤡',
  '🥚', '🙈', '📸', '⚗️', '🔍️', '🏷️', '🌱', '🚩', '🥅', '💫',
  '🗑️', '🛂', '🩹', '🧐', '⚰️', '🧪', '👔', '🩺', '🧱', '🧑‍💻',
  '💸', '🧵', '🦺', '✈️',
];

/**
 * このリポジトリで日常的に使う gitmoji の早見表。
 * フックがエラーを出すときに表示する。CLAUDE.md の表と揃えること。
 */
export const COMMON_GITMOJIS = [
  { emoji: '✨', desc: '新機能' },
  { emoji: '🐛', desc: 'バグ修正' },
  { emoji: '🚑️', desc: '本番の緊急修正 (hotfix)' },
  { emoji: '📝', desc: 'ドキュメント・ADR' },
  { emoji: '♻️', desc: 'リファクタリング' },
  { emoji: '✅', desc: 'テストの追加・修正' },
  { emoji: '💄', desc: 'UI・スタイル' },
  { emoji: '⚡️', desc: 'パフォーマンス改善' },
  { emoji: '🔧', desc: '設定ファイルの変更' },
  { emoji: '👷', desc: 'CI / GitHub Actions' },
  { emoji: '🍱', desc: 'アセット (画像) の追加・更新' },
  { emoji: '🗃️', desc: 'マスターデータの更新' },
  { emoji: '🔥', desc: 'コード・ファイルの削除' },
  { emoji: '🚚', desc: 'ファイルの移動・リネーム' },
  { emoji: '⬆️', desc: '依存の更新' },
  { emoji: '🩹', desc: '軽微な修正' },
  { emoji: '🔍️', desc: 'SEO' },
  { emoji: '🔖', desc: 'リリースタグ' },
];

/** 検証をスキップする件名。git やツールが自動生成し、書式を選べないもの。 */
const EXEMPT_PATTERNS = [
  /^(?:Merge|Revert)\s/,
  /^(?:fixup|squash|amend)!\s/,
  // Dependabot は commit-message の書式を gitmoji にできないため対象外 (ADR 0066)
  /^(?:chore|build)\(deps(?:-dev)?\): [Bb]ump\s/,
];

/** 異体字セレクタを落として絵文字を正規化する。 */
const normalize = (/** @type {string} */ text) => text.replaceAll('\uFE0F', '');

const ALLOWED = new Set(GITMOJIS.map((emoji) => normalize(emoji)));

/**
 * @typedef {{ ok: true }
 *   | { ok: false, reason: 'empty' | 'no-gitmoji' | 'no-space' | 'no-subject' }} ValidationResult
 */

/**
 * コミットメッセージ全体から件名を取り出す。
 * `#` 始まりのコメント行と、`--verbose` が付ける鋏 (`>8`) 行以降を捨てる。
 * @param {string} raw
 * @returns {string}
 */
function extractSubject(raw) {
  const lines = [];
  for (const line of raw.split('\n')) {
    if (/^#.*>8/.test(line)) break;
    if (line.startsWith('#')) continue;
    lines.push(line);
  }
  return lines.find((line) => line.trim() !== '')?.trim() ?? '';
}

/**
 * コミットメッセージが gitmoji 規約に従っているか検証する。
 * @param {string} raw コミットメッセージ全文
 * @returns {ValidationResult}
 */
export function validateCommitMessage(raw) {
  const subject = extractSubject(raw);
  if (subject === '') return { ok: false, reason: 'empty' };
  if (EXEMPT_PATTERNS.some((pattern) => pattern.test(subject))) return { ok: true };

  const normalized = normalize(subject);
  const [head, ...rest] = normalized.split(' ');
  if (!ALLOWED.has(head)) {
    const startsWithGitmoji = [...ALLOWED].some((emoji) => normalized.startsWith(emoji));
    return { ok: false, reason: startsWithGitmoji ? 'no-space' : 'no-gitmoji' };
  }
  if (rest.join(' ').trim() === '') return { ok: false, reason: 'no-subject' };
  return { ok: true };
}

/** @type {Record<'empty' | 'no-gitmoji' | 'no-space' | 'no-subject', string>} */
const REASON_MESSAGES = {
  empty: 'コミットメッセージが空です。',
  'no-gitmoji': '件名が gitmoji で始まっていません。',
  'no-space': '絵文字と説明の間は半角スペース 1 個で区切ってください。',
  'no-subject': '絵文字のあとに説明がありません。',
};

/**
 * フックが表示するエラー文を組み立てる。
 * @param {'empty' | 'no-gitmoji' | 'no-space' | 'no-subject'} reason
 * @param {string} subject 取り出せた件名 (空なら省略される)
 * @returns {string}
 */
export function formatError(reason, subject) {
  return [
    '✗ コミットメッセージが gitmoji 規約 (ADR 0066) に違反しています。',
    '',
    `  理由: ${REASON_MESSAGES[reason]}`,
    ...(subject === '' ? [] : [`  件名: ${subject}`]),
    '',
    '件名は `<gitmoji> <日本語の説明>` の形式で書いてください。',
    '  例: ✨ イベント詳細に対象楽曲セクションを追加する',
    '  例: 🐛 特効未選択時に曲の先頭グループが消えるのを直す',
    '',
    'よく使う gitmoji:',
    ...COMMON_GITMOJIS.map(({ emoji, desc }) => `  ${emoji}  ${desc}`),
    '',
    '一覧: https://gitmoji.dev/ — 詳細は CLAUDE.md「コミットメッセージ規約」を参照。',
  ].join('\n');
}

const isCli =
  process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;

if (isCli) {
  const messagePath = process.argv[2];
  if (messagePath === undefined) {
    console.error('usage: node scripts/check-commit-msg.mjs <commit-msg-file>');
    process.exit(2);
  }
  const raw = readFileSync(messagePath, 'utf8');
  const result = validateCommitMessage(raw);
  if (!result.ok) {
    console.error(formatError(result.reason, extractSubject(raw)));
    process.exit(1);
  }
}
