import { describe, it, expect } from 'vitest';
import {
  pipelineOverviewSvg,
  teamAttrStackSvg,
  attrFormulaSvg,
  lightMultiplierChartSvg,
  noteScoreStepsSvg,
  scoreUpTimelineSvg,
  shrinkTimelineSvg,
  simulateActivationsDeterministic,
  simulateActivationsMulti,
  excludeHeadSvg,
  coverageDiagramSvg,
  shrinkFormulaSvg,
  finalBonusSvg,
  scoreRangeSvg,
  mcHistogramSvg,
  accumulationBarSvg,
  CARD_COLORS,
  STAGE_COLORS,
  type AccumulationStage,
} from '../../../src/lib/score/specDiagrams';
import { buildSpecDemo, DEMO_DECK_IDS } from '../../../src/lib/score/specDemo';

function isValidSvg(s: string): boolean {
  return /^<svg[\s\S]*<\/svg>\s*$/.test(s.trim());
}

describe('specDiagrams', () => {
  describe('pipelineOverviewSvg', () => {
    it('有効な SVG で全 6 段階のタイトルを含む', () => {
      const svg = pipelineOverviewSvg();
      expect(isValidSvg(svg)).toBe(true);
      for (const title of ['チーム属性値', '1ノーツ素点', 'スコアアップ加算', '判定縮小加算', '最終補正', 'リザルト分布']) {
        expect(svg).toContain(title);
      }
    });
    it('highlight 指定で該当段階が淡色塗り + 太枠になる', () => {
      const svg = pipelineOverviewSvg({ highlight: 'shrink' });
      expect(svg).toContain(STAGE_COLORS.shrink.pale);
      expect(svg).toContain('stroke-width="3"');
      // 非ハイライト段階は淡色化される
      expect(svg).toContain('opacity="0.35"');
    });
  });

  describe('teamAttrStackSvg / attrFormulaSvg', () => {
    it('チーム属性値の内訳バーに 3 属性と合計値を描画する', async () => {
      const demo = await buildSpecDemo();
      const svg = teamAttrStackSvg(demo.team);
      expect(isValidSvg(svg)).toBe(true);
      for (const attr of ['Shout', 'Beat', 'Melody']) expect(svg).toContain(attr);
      expect(svg).toContain(demo.team.Melody.toLocaleString('en-US'));
      expect(svg).toContain('センタースキル');
    });
    it('attrFormulaSvg は計算手順 5 ステップを含む', () => {
      const svg = attrFormulaSvg();
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain('衣装の基礎値');
      expect(svg).toContain('イベント特効');
      expect(svg).toContain('センタースキル');
      expect(svg).toContain('⌊ ⌋');
    });
  });

  describe('lightMultiplierChartSvg', () => {
    it('全グループの倍率を描画する', () => {
      const svg = lightMultiplierChartSvg();
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain('×3'); // chorus_light_6
      expect(svg).toContain('サビ光6');
      expect(svg).not.toContain('ノーツ</text>'); // groupSizes なしではノーツ数注記なし
    });
    it('groupSizes を渡すとノーツ数の注記が付く', () => {
      const svg = lightMultiplierChartSvg({ notes_20: 21, light_6: 95 });
      expect(svg).toContain('21ノーツ');
      expect(svg).toContain('95ノーツ');
    });
  });

  describe('noteScoreStepsSvg', () => {
    it('floor 2 段階の実数値を含む', () => {
      const svg = noteScoreStepsSvg({
        appeal: 49267, attr: 'Melody', noteType: 'color', noteRate: 0.03, group: 'chorus_light_6',
      });
      expect(isValidSvg(svg)).toBe(true);
      const perNoteBase = Math.floor(49267 * 0.03); // 1478
      const score = Math.floor(perNoteBase * 3.0);  // 4434
      expect(svg).toContain(perNoteBase.toLocaleString('en-US'));
      expect(svg).toContain(score.toLocaleString('en-US'));
      expect(svg).toContain('⌊ ⌋');
    });
    it('未知のグループは倍率 1.0 として扱う', () => {
      const svg = noteScoreStepsSvg({
        appeal: 10000, attr: 'Shout', noteType: 'white', noteRate: 0.025, group: 'unknown_group',
      });
      expect(svg).toContain('× ライト倍率 1.0');
    });
  });

  describe('scoreUpTimelineSvg', () => {
    const base = { notesCount: 428, songDuration: 104, seed: 7 };
    it('ノート型・タイマー型のレーンを描画する', () => {
      const svg = scoreUpTimelineSvg({
        lanes: [
          { label: 'ノート型テスト', count: 13, per: 100, value: 4618, isTimer: false },
          { label: 'タイマー型テスト', count: 5, per: 0, value: 5674, isTimer: true },
        ],
        ...base,
      });
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain('ノート型テスト');
      expect(svg).toContain('タイマー型テスト');
      // per=100 → 全発動 32/32、per=0 → 0/20
      expect(svg).toContain('発動 32/32 回');
      expect(svg).toContain('発動 0/20 回');
    });
    it('同じ seed で決定論的', () => {
      const params = {
        lanes: [{ label: 'x', count: 13, per: 49, value: 100, isTimer: false }],
        ...base,
      };
      expect(scoreUpTimelineSvg(params)).toBe(scoreUpTimelineSvg(params));
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
      expect(svg).toContain('衣装1 (20ノーツ/40%/4秒)');
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
      expect(simulateActivationsDeterministic(args)).toEqual(simulateActivationsDeterministic(args));
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
      expect(svg).not.toContain('opacity="0.3"');
    });
    it('100% を完全に超えた後発セグメントは超過破線のみになる', () => {
      const svg = coverageDiagramSvg({
        songDuration: 104,
        segments: [
          { label: 'A', seconds: 110, color: '#f59e0b' },
          { label: 'B', seconds: 20, color: '#f97316' },
        ],
      });
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain('超過部 = 切り捨て');
    });
  });

  describe('shrinkFormulaSvg', () => {
    it('3 項すべてのラベルと floor マーカーを含む', () => {
      const svg = shrinkFormulaSvg();
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain('対象素点合計');
      expect(svg).toContain('倍率 − 1.0');
      expect(svg).toContain('カバー率');
      expect(svg).toContain('eligibleBaseScore');
    });
  });

  describe('finalBonusSvg', () => {
    it('バッジ適用とブローチ加算の実数値を含む', () => {
      const svg = finalBonusSvg({ liveEndScore: 1_344_210, badgeRate: 16, broachScoreBonus: 1000 });
      expect(isValidSvg(svg)).toBe(true);
      const afterBadge = Math.floor(1_344_210 * 1.16);
      expect(svg).toContain(afterBadge.toLocaleString('en-US'));
      expect(svg).toContain((afterBadge + 1000).toLocaleString('en-US'));
      expect(svg).toContain('⌊ ⌋');
    });
  });

  describe('scoreRangeSvg', () => {
    it('理論最低・期待値・MC 平均・理論最高のマーカーを含む', () => {
      const svg = scoreRangeSvg({
        minScore: 884_969, expectedScore: 1_559_283, maxScore: 2_097_827,
        mcMean: 1_531_124, mcP90: 1_630_646, mcMin: 1_277_124, mcMax: 1_741_763,
      });
      expect(isValidSvg(svg)).toBe(true);
      for (const label of ['理論最低', '期待値', 'MC 平均', '理論最高']) expect(svg).toContain(label);
      expect(svg).toContain('884,969');
      expect(svg).toContain('2,097,827');
    });
  });

  describe('mcHistogramSvg', () => {
    it('有効な SVG を返す', () => {
      const scores = Array.from({ length: 200 }, (_, i) => 100_000 + (i % 37) * 1000);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      expect(isValidSvg(mcHistogramSvg(scores, mean))).toBe(true);
    });
  });

  describe('accumulationBarSvg', () => {
    const stages: AccumulationStage[] = [
      { label: 'ノーツ素点', value: 762_905, stage: 'note' },
      { label: 'スコアアップ', value: 286_771, stage: 'scoreUp' },
      { label: '判定縮小', value: 294_534, stage: 'shrink' },
      { label: '最終補正', value: 215_073, stage: 'final' },
    ];
    it('途中章では「ここまで」カーソルを表示する', () => {
      const svg = accumulationBarSvg({ stages, activeCount: 1 });
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain('ここまで 762,905');
      expect(svg).toContain('opacity="0.18"'); // 未確定セグメントの薄表示
    });
    it('全段確定では最終合計を表示する', () => {
      const svg = accumulationBarSvg({ stages, activeCount: 4 });
      const total = stages.reduce((a, s) => a + s.value, 0);
      expect(svg).toContain(`最終 ${total.toLocaleString('en-US')}`);
      expect(svg).not.toMatch(/ここまで [\d,]+/); // 途中カーソルは出ない (aria-label の「ここまで」は除く)
    });
    it('幅の狭いセグメントはバー内ラベルを省略する', () => {
      const svg = accumulationBarSvg({
        stages: [
          { label: '大きい', value: 1_000_000, stage: 'note' },
          { label: '極小', value: 1_000, stage: 'final' },
        ],
        activeCount: 2,
      });
      expect(svg).toContain('大きい');
      expect(svg).not.toContain('>極小<');
    });
  });

  describe('simulateActivationsMulti', () => {
    const common = { notesCount: 428, songDuration: 104, excludeHead: 21, seed: 7 };

    it('空カードなら空配列を返す', () => {
      expect(simulateActivationsMulti({ cards: [], ...common })).toEqual([]);
    });

    it('同じ seed で決定論的', () => {
      const cards = [{ count: 20, per: 40, value: 4 }, { count: 23, per: 39, value: 5 }];
      expect(simulateActivationsMulti({ cards, ...common }))
        .toEqual(simulateActivationsMulti({ cards, ...common }));
    });

    it('各カードのトリガー数 ≤ floor(eligibleCount / count)', () => {
      const cards = [{ count: 20, per: 100, value: 4 }, { count: 23, per: 100, value: 5 }];
      const acts = simulateActivationsMulti({ cards, ...common });
      const eligible = 428 - 21;
      expect(acts.filter((a) => a.cardIndex === 0).length).toBeLessThanOrEqual(Math.floor(eligible / 20));
      expect(acts.filter((a) => a.cardIndex === 1).length).toBeLessThanOrEqual(Math.floor(eligible / 23));
    });

    it('キューイング仕様: 発動区間が時間軸上で重ならない', () => {
      const cards = [
        { count: 10, per: 100, value: 10 },
        { count: 11, per: 100, value: 10 },
      ];
      const acts = simulateActivationsMulti({
        cards, notesCount: 400, songDuration: 100, excludeHead: 0, seed: 1,
      });
      const fired = acts.filter((a) => a.fired).sort((a, b) => a.start - b.start);
      for (let i = 1; i < fired.length; i++) {
        expect(fired[i - 1].end).toBeLessThanOrEqual(fired[i].start);
      }
    });

    it('曲全体を超えたキューはあふれて切り捨てられる', () => {
      const cards = [{ count: 5, per: 100, value: 20 }];
      const acts = simulateActivationsMulti({
        cards, notesCount: 100, songDuration: 50, excludeHead: 0, seed: 1,
      });
      for (const a of acts.filter((x) => x.fired)) {
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
      expect(svg).toContain('衣装1 (20ノーツ/40%/4秒)');
      expect(svg).toContain('衣装2 (23ノーツ/39%/5秒)');
      expect(svg).toContain(CARD_COLORS[1]);
    });
  });
});

describe('specDemo', () => {
  it('デモ編成 6 枠すべてが fixtures に存在し、エンジン計算の不変条件を満たす', async () => {
    const demo = await buildSpecDemo();

    // デッキ構成
    expect(demo.slots).toHaveLength(DEMO_DECK_IDS.length);
    expect(demo.slots.map((s) => s.ID)).toEqual([...DEMO_DECK_IDS]);
    expect(demo.slots.filter((s) => s.isShrink)).toHaveLength(2);

    // ノーツとグループ
    expect(demo.notes).toHaveLength(demo.notesCount);
    expect(demo.exclusion.totalExcluded).toBeGreaterThan(0);

    // スコアの大小関係: 理論最低 ≤ 期待値 ≤ 理論最高、MC も範囲内
    expect(demo.minScore).toBeLessThanOrEqual(demo.expected.finalScore);
    expect(demo.expected.finalScore).toBeLessThanOrEqual(demo.maxScore);
    expect(demo.mc.mcMin).toBeGreaterThanOrEqual(demo.minScore);
    expect(demo.mc.mcMax).toBeLessThanOrEqual(demo.maxScore);

    // 期待値の内訳が合計と一致
    expect(demo.expected.baseScore + demo.expected.scoreUpExpected + demo.expected.shrinkExpected)
      .toBe(demo.expected.liveEndScore);

    // カバー率: 内部値は 100% キャップ、raw は超過可
    expect(demo.coverage.coverageRate).toBeLessThanOrEqual(1.0);
    expect(demo.coverage.rawCoverageRate).toBeGreaterThan(demo.coverage.coverageRate - 1e-9);

    // 各スロットのスキル統計
    for (const s of demo.slots) {
      expect(s.skillExpected).toBeGreaterThan(0);
      expect(s.skillMax).toBeGreaterThanOrEqual(s.skillExpected);
      expect(s.maxActivations).toBeGreaterThan(0);
    }
  });

  it('同じ seed 設定で決定論的（MC 平均が再現する）', async () => {
    const a = await buildSpecDemo();
    const b = await buildSpecDemo();
    expect(a.mc.mean).toBe(b.mc.mean);
    expect(a.expected.finalScore).toBe(b.expected.finalScore);
  });
});
