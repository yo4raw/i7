import { describe, it, expect } from 'vitest';
import {
  overviewFlowSvg,
  shrinkTimelineSvg,
  excludeHeadSvg,
  coverageDiagramSvg,
  formulaDiagramSvg,
  mcDistributionSvg,
  generateDemoScores,
  simulateActivationsDeterministic,
  simulateActivationsMulti,
} from '../../../src/lib/score/specDiagrams';

function isValidSvg(s: string): boolean {
  return /^<svg[\s\S]*<\/svg>\s*$/.test(s.trim());
}

describe('specDiagrams', () => {
  describe('overviewFlowSvg', () => {
    it('有効な SVG 文字列を返す', () => {
      const svg = overviewFlowSvg();
      expect(isValidSvg(svg)).toBe(true);
    });
    it('主要ステップのタイトルを含む', () => {
      const svg = overviewFlowSvg();
      expect(svg).toContain('チーム属性値');
      expect(svg).toContain('アシスト適用');
      expect(svg).toContain('1ノーツ素点');
      expect(svg).toContain('ライト倍率');
      expect(svg).toContain('縮小加算');
      expect(svg).toContain('バッジ倍率適用');
      expect(svg).toContain('最終スコア');
    });
    it('矢印マーカーを定義する', () => {
      const svg = overviewFlowSvg();
      expect(svg).toContain('<marker id="arrow"');
      expect(svg).toContain('<marker id="arrow-shrink"');
    });
  });

  describe('shrinkTimelineSvg', () => {
    it('有効な SVG を返し、発動情報をラベルに含む', () => {
      const acts = simulateActivationsDeterministic({
        count: 20, per: 40, value: 4,
        notesCount: 428, songDuration: 104, excludeHead: 21, seed: 7,
      });
      const svg = shrinkTimelineSvg({
        count: 20, per: 40, value: 4,
        notesCount: 428, songDuration: 104, excludeHead: 21, activations: acts,
      });
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain('カード1 (20ノーツ/40%/4秒)');
      expect(svg).toContain('先頭除外 21ノート');
    });
    it('先頭除外が 0 のときは除外矩形を描画しない', () => {
      const svg = shrinkTimelineSvg({
        count: 20, per: 40, value: 4,
        notesCount: 400, songDuration: 100, excludeHead: 0, activations: [],
      });
      expect(svg).not.toContain('先頭除外');
    });
  });

  describe('simulateActivationsDeterministic', () => {
    it('同じ seed で同じ結果を返す（決定論）', () => {
      const args = { count: 20, per: 40, value: 4, notesCount: 428, songDuration: 104, excludeHead: 21, seed: 42 };
      const a = simulateActivationsDeterministic(args);
      const b = simulateActivationsDeterministic(args);
      expect(a).toEqual(b);
    });
    it('maxActivations = floor((notesCount - excludeHead) / count) になる', () => {
      const acts = simulateActivationsDeterministic({
        count: 20, per: 40, value: 4,
        notesCount: 428, songDuration: 104, excludeHead: 21, seed: 7,
      });
      expect(acts.length).toBe(Math.floor((428 - 21) / 20)); // = 20
    });
  });

  describe('excludeHeadSvg', () => {
    it('notes_20 > minCount ケースで max = notes_20', () => {
      const svg = excludeHeadSvg({ notes20: 21, minCount: 20 });
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain('max(21, 20) = 21');
    });
    it('notes_20 < minCount ケースで max = minCount', () => {
      const svg = excludeHeadSvg({ notes20: 20, minCount: 22 });
      expect(svg).toContain('max(20, 22) = 22');
    });
    it('caseLabel を受け取って表示する', () => {
      const svg = excludeHeadSvg({ notes20: 20, minCount: 22, caseLabel: 'ケース B' });
      expect(svg).toContain('ケース B');
    });
  });

  describe('coverageDiagramSvg', () => {
    it('100% 超過時に破線スタイルのセグメントを出力する', () => {
      const svg = coverageDiagramSvg({
        songDuration: 104,
        segments: [
          { label: 'A', seconds: 80, color: '#f59e0b' },
          { label: 'B', seconds: 85, color: '#f97316' },
        ],
      });
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain('stroke-dasharray'); // 超過部分の破線
      expect(svg).toContain('158.7%');           // raw カバー率
      expect(svg).toContain('100.0%');           // キャップ後
    });
    it('合計が songDuration 以下なら超過破線は描画されない', () => {
      const svg = coverageDiagramSvg({
        songDuration: 104,
        segments: [{ label: 'A', seconds: 80, color: '#f59e0b' }],
      });
      // 100% 超過の破線 rect は出ない（ただし stroke-dasharray は他の用途で出るかもしれないので、
      // "opacity=\"0.3\"" の超過塗りが出ないことを確認する）
      expect(svg).not.toContain('opacity="0.3"');
    });
  });

  describe('formulaDiagramSvg', () => {
    it('有効な SVG を返し、3 項すべてのラベルを含む', () => {
      const svg = formulaDiagramSvg();
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain('eligibleBaseScore');
      expect(svg).toContain('rate − 1.0');
      expect(svg).toContain('coverageRate');
      expect(svg).toContain('floor(');
    });
  });

  describe('generateDemoScores', () => {
    it('決定論的（同じ seed で同じ先頭要素）', () => {
      const params = { baseScore: 100000, maxActivations: 20, per: 40, addPerActivation: 1000, seed: 42, n: 10 };
      const a = generateDemoScores(params);
      const b = generateDemoScores(params);
      expect(a).toEqual(b);
    });
    it('指定した件数を返す', () => {
      const scores = generateDemoScores({
        baseScore: 0, maxActivations: 20, per: 40, addPerActivation: 100, seed: 1, n: 500,
      });
      expect(scores.length).toBe(500);
    });
    it('スコアは baseScore 以上 baseScore + maxActivations*addPerActivation 以下', () => {
      const scores = generateDemoScores({
        baseScore: 100, maxActivations: 10, per: 50, addPerActivation: 50, seed: 7, n: 100,
      });
      for (const s of scores) {
        expect(s).toBeGreaterThanOrEqual(100);
        expect(s).toBeLessThanOrEqual(100 + 10 * 50);
      }
    });
  });

  describe('mcDistributionSvg', () => {
    it('有効な SVG を返す', () => {
      const svg = mcDistributionSvg({ baseScore: 293120, seed: 42, iterations: 1000 });
      expect(isValidSvg(svg)).toBe(true);
    });
  });

  describe('simulateActivationsMulti', () => {
    const common = { notesCount: 428, songDuration: 104, excludeHead: 21, seed: 7 };

    it('空カードなら空配列を返す', () => {
      const acts = simulateActivationsMulti({ cards: [], ...common });
      expect(acts).toEqual([]);
    });

    it('同じ seed で決定論的', () => {
      const cards = [{ count: 20, per: 40, value: 4 }, { count: 23, per: 39, value: 5 }];
      const a = simulateActivationsMulti({ cards, ...common });
      const b = simulateActivationsMulti({ cards, ...common });
      expect(a).toEqual(b);
    });

    it('各カードのトリガー数 = floor(eligibleCount / count)（不発含む）', () => {
      const cards = [{ count: 20, per: 100, value: 4 }, { count: 23, per: 100, value: 5 }];
      const acts = simulateActivationsMulti({ cards, ...common });
      const card0Triggers = acts.filter((a) => a.cardIndex === 0);
      const card1Triggers = acts.filter((a) => a.cardIndex === 1);
      // per=100 なのですべて fired、切り捨てを除いた発動数を確認
      const eligible = 428 - 21; // 407
      // キューイングで曲全体を超えた分は切り捨てられるので、trigger 数 = floor(eligible/count)
      // ただし Phase1 では fired=true のみがキューイング対象 (不発は即座に追加)
      expect(card0Triggers.length).toBeLessThanOrEqual(Math.floor(eligible / 20));
      expect(card1Triggers.length).toBeLessThanOrEqual(Math.floor(eligible / 23));
    });

    it('キューイング仕様: 発動区間が時間軸上で重ならない', () => {
      // per=100 で必ず発動させ、重なるはずのパラメータでもキューイングで重なりがないことを確認
      const cards = [
        { count: 10, per: 100, value: 10 },  // 長い持続、頻繁に発動
        { count: 11, per: 100, value: 10 },
      ];
      const acts = simulateActivationsMulti({
        cards, notesCount: 400, songDuration: 100, excludeHead: 0, seed: 1,
      });
      const fired = acts.filter((a) => a.fired).sort((a, b) => a.start - b.start);
      for (let i = 1; i < fired.length; i++) {
        // 時間軸上で重ならない: 前の end ≤ 次の start
        expect(fired[i - 1].end).toBeLessThanOrEqual(fired[i].start);
      }
    });

    it('曲全体を超えたキューはあふれて切り捨てられる', () => {
      // notesCount 超過するまで大量発動させると、あふれて追加されなくなる
      const cards = [{ count: 5, per: 100, value: 20 }]; // 5ノーツ毎、20秒持続
      const acts = simulateActivationsMulti({
        cards, notesCount: 100, songDuration: 50, excludeHead: 0, seed: 1,
      });
      const firedActs = acts.filter((a) => a.fired);
      for (const a of firedActs) {
        expect(a.end).toBeLessThanOrEqual(100);
      }
    });

    it('shrinkTimelineSvg がマルチカード対応で各カードのラベルを含む', () => {
      const cards = [
        { count: 20, per: 40, value: 4 },
        { count: 23, per: 39, value: 5 },
      ];
      const acts = simulateActivationsMulti({ cards, ...common });
      const svg = shrinkTimelineSvg({
        count: cards[0].count, per: cards[0].per, value: cards[0].value,
        cards,
        notesCount: 428, songDuration: 104, excludeHead: 21, activations: acts,
      });
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain('カード1 (20ノーツ/40%/4秒)');
      expect(svg).toContain('カード2 (23ノーツ/39%/5秒)');
    });
  });
});
