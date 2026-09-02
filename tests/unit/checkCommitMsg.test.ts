import { describe, it, expect } from 'vitest';
import {
  validateCommitMessage,
  formatError,
  GITMOJIS,
  COMMON_GITMOJIS,
} from '../../scripts/check-commit-msg.mjs';

describe('validateCommitMessage (gitmoji コミット規約の検証)', () => {
  describe('正常系', () => {
    it('gitmoji + 半角スペース + 説明 を通す', () => {
      expect(validateCommitMessage('✨ イベント詳細に対象楽曲セクションを追加する')).toEqual({
        ok: true,
      });
    });

    it('異体字セレクタ (U+FE0F) 付きの絵文字を通す', () => {
      expect(validateCommitMessage('♻️ fetchSongsJson から旧 API を削除する')).toEqual({ ok: true });
    });

    it('異体字セレクタ なしの同じ絵文字も通す', () => {
      expect(validateCommitMessage('♻ fetchSongsJson から旧 API を削除する')).toEqual({ ok: true });
    });

    it('ZWJ 結合の絵文字 (🧑‍💻) を通す', () => {
      expect(validateCommitMessage('🧑‍💻 開発体験を改善する')).toEqual({ ok: true });
    });

    it('2 行目以降の本文は検査しない', () => {
      const message = ['🐛 特効未選択時に曲の先頭グループが消えるのを直す', '', 'feat: 本文は自由に書ける'].join('\n');
      expect(validateCommitMessage(message)).toEqual({ ok: true });
    });

    it('先頭の空行やコメント行を読み飛ばして件名を見つける', () => {
      const message = ['# Please enter the commit message', '', '📝 ADR 0066 を追加する'].join('\n');
      expect(validateCommitMessage(message)).toEqual({ ok: true });
    });
  });

  describe('検証をスキップする例外', () => {
    it('マージコミット', () => {
      expect(validateCommitMessage("Merge branch 'main' into develop")).toEqual({ ok: true });
    });

    it('リバートコミット', () => {
      expect(validateCommitMessage('Revert "✨ イベント詳細に対象楽曲セクションを追加する"')).toEqual({
        ok: true,
      });
    });

    it('fixup! / squash! / amend! の自動生成メッセージ', () => {
      expect(validateCommitMessage('fixup! ✨ イベント詳細に対象楽曲セクションを追加する')).toEqual({ ok: true });
      expect(validateCommitMessage('squash! ✨ イベント詳細に対象楽曲セクションを追加する')).toEqual({ ok: true });
      expect(validateCommitMessage('amend! ✨ イベント詳細に対象楽曲セクションを追加する')).toEqual({ ok: true });
    });

    it('Dependabot の依存更新 (書式を変更できないため対象外)', () => {
      expect(validateCommitMessage('chore(deps-dev): Bump vitest from 4.1.9 to 4.1.10')).toEqual({
        ok: true,
      });
      expect(validateCommitMessage('build(deps): bump astro from 7.1.0 to 7.2.0')).toEqual({ ok: true });
    });

    it('Dependabot 以外の chore(deps) 風メッセージは通さない', () => {
      expect(validateCommitMessage('chore(deps): 依存を整理する')).toEqual({
        ok: false,
        reason: 'no-gitmoji',
      });
    });
  });

  describe('異常系', () => {
    it('絵文字がない Conventional Commits 形式を弾く', () => {
      expect(validateCommitMessage('feat(events): イベント詳細に対象楽曲セクションを追加する')).toEqual({
        ok: false,
        reason: 'no-gitmoji',
      });
    });

    it('gitmoji に含まれない絵文字を弾く', () => {
      expect(validateCommitMessage('🙃 イベント詳細に対象楽曲セクションを追加する')).toEqual({
        ok: false,
        reason: 'no-gitmoji',
      });
    });

    it('絵文字の直後に半角スペースがないものを弾く', () => {
      expect(validateCommitMessage('✨イベント詳細に対象楽曲セクションを追加する')).toEqual({
        ok: false,
        reason: 'no-space',
      });
    });

    it('全角スペース区切りを弾く', () => {
      expect(validateCommitMessage('✨　イベント詳細に対象楽曲セクションを追加する')).toEqual({
        ok: false,
        reason: 'no-space',
      });
    });

    it('絵文字だけで説明がないものを弾く', () => {
      expect(validateCommitMessage('✨')).toEqual({ ok: false, reason: 'no-subject' });
      expect(validateCommitMessage('✨ ')).toEqual({ ok: false, reason: 'no-subject' });
    });

    it('空メッセージを弾く', () => {
      expect(validateCommitMessage('')).toEqual({ ok: false, reason: 'empty' });
      expect(validateCommitMessage('\n\n  \n')).toEqual({ ok: false, reason: 'empty' });
    });

    it('コメントと --verbose の diff しかないメッセージを空として弾く', () => {
      const message = [
        '',
        '# Please enter the commit message for your changes.',
        '# ------------------------ >8 ------------------------',
        'diff --git a/src/lib/ui.ts b/src/lib/ui.ts',
        '+const x = 1;',
      ].join('\n');
      expect(validateCommitMessage(message)).toEqual({ ok: false, reason: 'empty' });
    });
  });

  describe('絵文字リスト', () => {
    it('早見表の絵文字はすべて許可リストに含まれる', () => {
      for (const { emoji } of COMMON_GITMOJIS) {
        expect(GITMOJIS).toContain(emoji);
      }
    });

    it('許可リストに重複がない', () => {
      expect(new Set(GITMOJIS).size).toBe(GITMOJIS.length);
    });
  });
});

describe('formatError (フックが表示するエラー文)', () => {
  it('違反の理由と件名を日本語で示す', () => {
    const text = formatError('no-gitmoji', 'feat(events): 対象楽曲を追加する');
    expect(text).toContain('件名が gitmoji で始まっていません。');
    expect(text).toContain('feat(events): 対象楽曲を追加する');
  });

  it('理由ごとに説明を出し分ける', () => {
    expect(formatError('no-space', '✨対象楽曲')).toContain('半角スペース');
    expect(formatError('no-subject', '✨')).toContain('説明がありません');
    expect(formatError('empty', '')).toContain('空です');
  });

  it('件名が空のときは件名の行を出さない', () => {
    expect(formatError('empty', '')).not.toContain('件名:');
  });

  it('よく使う gitmoji の早見表を含む', () => {
    const text = formatError('no-gitmoji', 'feat: 何か');
    for (const { emoji, desc } of COMMON_GITMOJIS) {
      expect(text).toContain(emoji);
      expect(text).toContain(desc);
    }
  });

  it('正しい書き方の例を含む', () => {
    expect(formatError('no-gitmoji', 'feat: 何か')).toContain('✨ イベント詳細に対象楽曲セクションを追加する');
  });
});
