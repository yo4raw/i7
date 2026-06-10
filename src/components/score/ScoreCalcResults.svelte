<script lang="ts">
  import type { Song } from '../../lib/data/fetchSongsJson';
  import type { FixedBroach } from '../../lib/data/fetchFixedBroachsJson';
  import type { DeckState } from '../../lib/score/deckState';
  import type { ScoreOptions, SimulationResult, ExpectedScore } from '../../lib/score/types';
  import {
    computeTeam,
    calcMinScore,
    calcMaxScore,
    calcShrinkCoverage,
    calcExpectedScore,
    calcCardSkillExpected,
    calcCardSkillMax,
    calcCardSkillMaxActivations,
    runSimulation,
    flattenNotes,
    computeShrinkExclusion,
    computeGroupSizes,
  } from '../../lib/score/engine';
  import { MC_ITERATIONS, NOTE_RATE, LIGHT_MULTIPLIER } from '../../lib/score/constants';
  import { renderHistogramSvg } from '../../lib/score/histogram';
  import { SONG_NOTE_GROUP_KEYS } from '../../lib/data/fetchSongsJson';
  import { loadRabbitNotes } from '../../lib/data/rabbitNote';
  import { SLOT_LABELS, DISPLAY_ORDER } from '../../lib/score/deckState';

  let { deckState, selectedSong, allBroachs, scoreUpAssist, scoreUpBadgeRate }: {
    deckState: DeckState;
    selectedSong: Song | null;
    allBroachs: FixedBroach[];
    scoreUpAssist: boolean;
    scoreUpBadgeRate: number;
  } = $props();

  // --- 結果系の入力状態 ---
  let shrinkOffset = $state(0);
  let mcIterationsValue = $state(MC_ITERATIONS);
  let maxShrinkCoverageOpt = $state(false);
  let maxScoreUpCoverageOpt = $state(false);

  // --- MC シミュレーション状態 ---
  let running = $state(false);
  let hasRunOnce = $state(false);
  let progressPercent = $state(0);
  let progressText = $state('計算中...');
  let simulationResult = $state<SimulationResult | null>(null);
  let expectedScore = $state<ExpectedScore | null>(null);
  let mcIterationsUsed = $state<number | null>(null);

  // --- タブ ---
  type TabKey = 'expected' | 'skills' | 'area';
  let activeTab = $state<TabKey>('expected');
  const TABS: Array<{ key: TabKey; label: string }> = [
    { key: 'expected', label: '📈 期待値' },
    { key: 'skills', label: '⚡ スキル発動' },
    { key: 'area', label: '🎵 面積値' },
  ];

  // --- 計算（旧 recalculate の計算部）---
  const calc = $derived.by(() => {
    const filledCount = deckState.cards.filter(c => c !== null).length;
    if (!selectedSong || filledCount === 0) return null;

    const team = computeTeam(deckState.cards, allBroachs, selectedSong, deckState.bonusTiers, deckState.trained, undefined, deckState.sharedBroachs, deckState.skillLevels, loadRabbitNotes());
    const exclusion = computeShrinkExclusion(team, computeGroupSizes(selectedSong));
    const notes = flattenNotes(selectedSong, 42, exclusion);

    const options: ScoreOptions = {
      scoreUpAssist,
      scoreUpBadgeRate: Number(scoreUpBadgeRate) || 0,
    };

    const minScore = calcMinScore(team, notes, options);
    const maxScore = calcMaxScore(team, notes, options);

    return { team, exclusion, notes, options, minScore, maxScore };
  });

  // 理論値は旧実装どおり、デッキ/楽曲が空になっても直前の値を保持する
  let scoreMinText = $state('-');
  let scoreMaxText = $state('-');
  $effect(() => {
    if (calc) {
      scoreMinText = calc.minScore.toLocaleString();
      scoreMaxText = calc.maxScore.toLocaleString();
    }
  });

  // デッキ・楽曲・オプション変更で MC 結果をクリア（旧 recalculate の挙動）
  $effect(() => {
    void calc;
    simulationResult = null;
    expectedScore = null;
  });

  // --- スキル詳細（旧 renderSkillPerCard）---
  const skillRows = $derived.by(() => {
    if (!calc || !selectedSong) return null;
    const notesCount = selectedSong.notes_count || 0;
    type Row = { i: number; slotCls: string; cardname: string; name: string; skillType: string; exp: number; activations: number; max: number };
    const rows: Row[] = [];
    let totalExp = 0;
    let totalMax = 0;
    let totalActivations = 0;
    for (const i of DISPLAY_ORDER) {
      const card = deckState.cards[i];
      if (!card) continue;
      const exp = calcCardSkillExpected(calc.team, calc.notes, notesCount, i, calc.options);
      const max = calcCardSkillMax(calc.team, calc.notes, notesCount, i, calc.options);
      const activations = calcCardSkillMaxActivations(calc.team, notesCount, i);
      totalExp += exp;
      totalMax += max;
      totalActivations += activations;
      rows.push({
        i,
        slotCls: i === 0 ? 'text-indigo-600 font-bold' : i === 5 ? 'text-amber-600 font-bold' : 'text-gray-500',
        cardname: card.cardname || '',
        name: card.name || '',
        skillType: card.ap_skill_type || '-',
        exp,
        activations,
        max,
      });
    }
    if (rows.length === 0) return null;
    return { rows, totalExp, totalMax, totalActivations };
  });

  // --- 縮小カバー率（旧 updateShrinkCoverage）---
  const shrink = $derived.by(() => {
    if (!calc || !selectedSong) return null;
    const offset = Number(shrinkOffset) || 0;
    const coverage = calcShrinkCoverage(calc.team, selectedSong.notes_count || 0, offset, calc.exclusion.totalExcluded);
    if (!coverage) return null;
    const rawPct = (coverage.rawCoverageRate * 100).toFixed(1);
    const rawText = `${rawPct}%（${coverage.rawCoveredSeconds.toFixed(1)}秒 / ${coverage.effectiveSeconds.toFixed(1)}秒）`;
    const coverageText = coverage.rawCoverageRate > 1.0
      ? `${rawText} ※100%超過分は計算対象外`
      : rawText;
    const rawExpPct = (coverage.rawExpectedCoverageRate * 100).toFixed(1);
    const rawExpText = `${rawExpPct}%（${coverage.rawExpectedCoveredSeconds.toFixed(1)}秒 / ${coverage.effectiveSeconds.toFixed(1)}秒）`;
    const hasOverlapCorrection =
      Math.abs(coverage.rawExpectedCoverageRate - coverage.expectedCoverageRate) > 0.001;
    const expectedText = hasOverlapCorrection
      ? `${rawExpText} ※重複区間で確率合成により実効カバー率は低下`
      : rawExpText;
    return { coverageText, expectedText };
  });

  // --- 面積値（旧 renderAreaValues）---
  const area = $derived.by(() => {
    if (!calc || !selectedSong) return null;

    let sWhiteWeighted = 0, sColorWeighted = 0;
    let bWhiteWeighted = 0, bColorWeighted = 0;
    let mWhiteWeighted = 0, mColorWeighted = 0;

    for (const gk of SONG_NOTE_GROUP_KEYS) {
      const mult = LIGHT_MULTIPLIER[gk];
      const g = selectedSong[gk];
      if (!g) continue;
      sWhiteWeighted += (g.shout_white || 0) * mult;
      sColorWeighted += (g.shout_color || 0) * mult;
      bWhiteWeighted += (g.beat_white || 0) * mult;
      bColorWeighted += (g.beat_color || 0) * mult;
      mWhiteWeighted += (g.melody_white || 0) * mult;
      mColorWeighted += (g.melody_color || 0) * mult;
    }

    const team = calc.team;
    return {
      s: { white: Math.floor(team.Shout * NOTE_RATE.white * sWhiteWeighted), color: Math.floor(team.Shout * NOTE_RATE.color * sColorWeighted) },
      b: { white: Math.floor(team.Beat * NOTE_RATE.white * bWhiteWeighted), color: Math.floor(team.Beat * NOTE_RATE.color * bColorWeighted) },
      m: { white: Math.floor(team.Melody * NOTE_RATE.white * mWhiteWeighted), color: Math.floor(team.Melody * NOTE_RATE.color * mColorWeighted) },
    };
  });

  // --- 計算ボタン（旧 updateCalcButton）---
  const hasCards = $derived(deckState.cards.some(c => c !== null));
  const calcDisabledReason = $derived(
    !selectedSong && !hasCards ? '楽曲を選択し、衣装を1枚以上配置してください'
      : !selectedSong ? '楽曲を選択してください'
      : !hasCards ? '衣装を1枚以上配置してください'
      : ''
  );
  const calcDisabled = $derived(running || calcDisabledReason !== '');

  // --- ヒストグラム ---
  const mainHistogram = $derived(
    simulationResult
      ? renderHistogramSvg(simulationResult.scores, simulationResult.minScore, simulationResult.maxScore, simulationResult.mean)
      : ''
  );
  const contribHistograms = $derived.by(() => {
    const result = simulationResult;
    if (!result) return null;
    let sharedMin = Infinity, sharedMax = -Infinity;
    for (const v of result.shrinkScores) {
      if (v < sharedMin) sharedMin = v;
      if (v > sharedMax) sharedMax = v;
    }
    for (const v of result.scoreUpScores) {
      if (v < sharedMin) sharedMin = v;
      if (v > sharedMax) sharedMax = v;
    }
    const make = (values: number[], label: string, color: string): string | null => {
      if (values.length === 0) return null;
      let sum = 0;
      for (const v of values) sum += v;
      return renderHistogramSvg(values, sharedMin, sharedMax, sum / values.length, { xAxisLabel: label, barColor: color });
    };
    return {
      shrink: make(result.shrinkScores, '縮小スキル寄与', '#10b981'),
      scoreup: make(result.scoreUpScores, 'スコアアップ寄与', '#6366f1'),
    };
  });

  // --- MC シミュレーション実行（旧 runMC、明示ボタンのみで実行）---
  async function runMC() {
    const snapshot = calc;
    const song = selectedSong;
    if (!snapshot || !song) return;

    running = true;

    const iterations = Math.max(1, Math.floor(Number(mcIterationsValue) || MC_ITERATIONS));

    const scoreOptions: ScoreOptions = {
      scoreUpAssist,
      scoreUpBadgeRate: Number(scoreUpBadgeRate) || 0,
      maxShrinkCoverage: maxShrinkCoverageOpt,
      maxScoreUpCoverage: maxScoreUpCoverageOpt,
    };

    const result = await runSimulation(snapshot.team, snapshot.notes, iterations, (pct) => {
      const percent = Math.round(pct * 100);
      progressPercent = percent;
      progressText = `計算中... ${percent}%`;
    }, undefined, scoreOptions);

    simulationResult = result;
    mcIterationsUsed = iterations;
    expectedScore = calcExpectedScore(snapshot.team, snapshot.notes, song.notes_count || snapshot.notes.length, scoreOptions);

    hasRunOnce = true;
    running = false;
  }
</script>

<details id="breakdown-section" class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 group" open>
  <summary class="cursor-pointer text-sm font-bold text-gray-700 dark:text-slate-200 flex items-center justify-between select-none mb-3">
    <span>📊 スキル詳細</span>
    <svg class="w-4 h-4 text-gray-400 dark:text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
  </summary>
  <section id="score-breakdown" class:hidden={!calc}>
    <div class="space-y-1">
      <div id="shrink-coverage-row" class="flex justify-between text-sm" class:hidden={!shrink}>
        <span class="text-gray-500 dark:text-slate-400">縮小カバー率（最大発動時）</span>
        <span id="shrink-coverage-val" class="font-medium text-orange-600">{shrink?.coverageText ?? ''}</span>
      </div>
      <div id="shrink-expected-row" class="flex justify-between text-sm" class:hidden={!shrink}>
        <span class="text-gray-500 dark:text-slate-400">縮小カバー率（期待値）</span>
        <span id="shrink-expected-val" class="font-medium text-orange-600">{shrink?.expectedText ?? ''}</span>
      </div>
    </div>
    <p id="shrink-exclusion-note" class="text-xs text-gray-400 dark:text-slate-500 mt-2" class:hidden={!(calc && calc.exclusion.totalExcluded > 0)}>※ 最初の<span id="shrink-exclusion-count" class="font-medium">{calc?.exclusion.totalExcluded ?? 0}</span>ノーツは縮小の計算対象外です</p>
    <div id="shrink-offset-row" class="flex items-center justify-end gap-1 mt-2 text-xs text-gray-500 dark:text-slate-400" class:hidden={!shrink}>
      <label for="shrink-offset-input">先頭</label>
      <input type="number" id="shrink-offset-input" bind:value={shrinkOffset} min="0" step="1" class="w-12 border border-gray-300 dark:border-slate-600 rounded px-1 py-0.5 text-right" />
      <span>秒除外</span>
    </div>
    <div id="skill-per-card-section" class="mt-4 border-t pt-3" class:hidden={!skillRows}>
      <table class="w-full text-xs">
        <thead>
          <tr class="text-gray-500 dark:text-slate-400 border-b">
            <th class="text-left py-1 px-1">スロット</th>
            <th class="text-left py-1 px-1">衣装名</th>
            <th class="text-left py-1 px-1">スキル</th>
            <th class="text-right py-1 px-1">スキル期待値</th>
            <th class="text-right py-1 px-1">スキル最大発動回数</th>
            <th class="text-right py-1 px-1">スキル論理最高値</th>
          </tr>
        </thead>
        <tbody id="skill-per-card-body">
          {#if skillRows}
            {#each skillRows.rows as row (row.i)}
              <tr class="border-t">
                <td class="py-1 px-1 text-[10px] {row.slotCls}">{SLOT_LABELS[row.i]}</td>
                <td class="py-1 px-1">
                  <div>{row.cardname}</div>
                  <div class="text-[10px] text-gray-400 dark:text-slate-500">{row.name}</div>
                </td>
                <td class="py-1 px-1">{row.skillType}</td>
                <td class="py-1 px-1 text-right">{row.exp > 0 ? row.exp.toLocaleString() : '-'}</td>
                <td class="py-1 px-1 text-right">{row.activations > 0 ? row.activations.toLocaleString() : '-'}</td>
                <td class="py-1 px-1 text-right">{row.max > 0 ? row.max.toLocaleString() : '-'}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
        <tfoot id="skill-per-card-foot">
          {#if skillRows}
            <tr class="border-t-2 border-gray-300 dark:border-slate-600 font-bold">
              <td colspan="3" class="py-1 px-1 text-right text-gray-700 dark:text-slate-200">合計</td>
              <td class="py-1 px-1 text-right">{skillRows.totalExp.toLocaleString()}</td>
              <td class="py-1 px-1 text-right">{skillRows.totalActivations.toLocaleString()}</td>
              <td class="py-1 px-1 text-right">{skillRows.totalMax.toLocaleString()}</td>
            </tr>
          {/if}
        </tfoot>
      </table>
      <p class="text-xs text-gray-400 dark:text-slate-500 mt-2">※ 複数の判定縮小スキルが共存する場合、値は按分されます</p>
    </div>
  </section>
  <p id="breakdown-placeholder" class="text-xs text-gray-400 dark:text-slate-500 text-center py-6" class:hidden={!!calc}>楽曲と衣装を設定するとスキル詳細が表示されます</p>
</details>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
  <div class="grid grid-cols-2 gap-4 text-center">
    <div>
      <div class="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-widest">理論最低</div>
      <div id="score-min" class="text-base md:text-lg font-bold text-gray-700 dark:text-slate-200 mt-1">{scoreMinText}</div>
    </div>
    <div>
      <div class="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-widest">理論最高</div>
      <div id="score-max" class="text-base md:text-lg font-bold text-gray-700 dark:text-slate-200 mt-1">{scoreMaxText}</div>
    </div>
  </div>
</section>

<div class="space-y-2">
  <div class="flex items-center justify-end gap-2 flex-wrap">
    <label for="mc-iterations-input" class="text-xs text-gray-500 dark:text-slate-400">シミュレーション回数</label>
    <input
      id="mc-iterations-input"
      type="number"
      min="1"
      step="1"
      class="w-28 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      bind:value={mcIterationsValue}
    />
    <span class="text-xs text-gray-500 dark:text-slate-400">回</span>
    <label class="flex items-center gap-1 text-xs text-gray-600 dark:text-slate-300 cursor-pointer select-none" title="ON にすると縮小スキルの確率判定を常に成功扱いにし、縮小カバー率が最大値となる前提で MC シミュレーションを実行します">
      <input type="checkbox" id="opt-max-shrink-coverage" class="rounded" bind:checked={maxShrinkCoverageOpt} />
      <span>縮小全発動</span>
    </label>
    <label class="flex items-center gap-1 text-xs text-gray-600 dark:text-slate-300 cursor-pointer select-none" title="ON にするとスコアアップスキル（タイマー型含む）の確率判定を常に成功扱いにし、スコアアップが理論最大発動回数となる前提で MC シミュレーションを実行します">
      <input type="checkbox" id="opt-max-scoreup-coverage" class="rounded" bind:checked={maxScoreUpCoverageOpt} />
      <span>スコアアップ全発動</span>
    </label>
  </div>
  <button id="btn-calculate" type="button" class="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={calcDisabled} onclick={runMC}>
    {running ? '計算中...' : hasRunOnce ? 'シミュレーション計算' : '🧮 シミュレーション計算'}
  </button>
  <p id="calc-disabled-reason" class="text-xs text-center text-amber-600">{calcDisabledReason}</p>
  <div id="progress-container" class:hidden={!running}>
    <div class="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
      <div id="progress-bar" class="bg-indigo-600 h-2 rounded-full transition-all" style="width: {progressPercent}%"></div>
    </div>
    <p id="progress-text" class="text-xs text-gray-500 dark:text-slate-400 mt-1 text-center">{progressText}</p>
  </div>
</div>

<section class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg shadow p-4 md:p-6">
  <div class="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-widest text-center">平均スコア</div>
  <div id="final-result" class="text-3xl md:text-5xl font-bold text-indigo-700 text-center mt-1">{simulationResult ? simulationResult.mean.toLocaleString() : '---'}</div>
  <div class="mt-3 text-center">
    <span class="text-[10px] text-gray-500 dark:text-slate-400">試行回数: </span>
    <span id="mc-iterations" class="text-xs md:text-sm font-bold text-gray-700 dark:text-slate-200">{mcIterationsUsed != null ? mcIterationsUsed.toLocaleString() : '-'}</span>
  </div>
</section>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
  <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-3">🎲 シミュレーション統計</h2>
  <section id="mc-results" class:hidden={!simulationResult}>
    <table class="w-full text-sm">
      <tbody>
        <tr><td class="text-gray-500 dark:text-slate-400 py-1">期待最低値</td><td id="mc-min-bound" class="text-right py-1">{simulationResult ? simulationResult.minScore.toLocaleString() : ''}</td></tr>
        <tr><td class="text-gray-500 dark:text-slate-400 py-1">最小</td><td id="mc-min" class="text-right py-1">{simulationResult ? simulationResult.mcMin.toLocaleString() : ''}</td></tr>
        <tr><td class="text-gray-500 dark:text-slate-400 py-1">平均</td><td id="mc-mean" class="text-right py-1 font-bold">{simulationResult ? simulationResult.mean.toLocaleString() : ''}</td></tr>
        <tr><td class="text-gray-500 dark:text-slate-400 py-1">中央値</td><td id="mc-median" class="text-right py-1">{simulationResult ? simulationResult.median.toLocaleString() : ''}</td></tr>
        <tr><td class="text-gray-500 dark:text-slate-400 py-1">最大</td><td id="mc-max" class="text-right py-1">{simulationResult ? simulationResult.mcMax.toLocaleString() : ''}</td></tr>
        <tr><td class="text-gray-500 dark:text-slate-400 py-1">期待最高値</td><td id="mc-max-bound" class="text-right py-1">{simulationResult ? simulationResult.maxScore.toLocaleString() : ''}</td></tr>
        <tr class="border-t"><td class="text-gray-500 dark:text-slate-400 py-1">標準偏差</td><td id="mc-stddev" class="text-right py-1">{simulationResult ? simulationResult.stddev.toLocaleString() : ''}</td></tr>
        <tr><td class="text-gray-500 dark:text-slate-400 py-1">90パーセンタイル</td><td id="mc-p90" class="text-right py-1">{simulationResult ? simulationResult.p90.toLocaleString() : ''}</td></tr>
      </tbody>
    </table>
    <div id="histogram-container" class="mt-4">{#if simulationResult}{@html mainHistogram}{/if}</div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <div>
        <div class="text-xs text-gray-600 dark:text-slate-300 mb-1">縮小スキル寄与量の分布</div>
        <div id="histogram-shrink">{#if contribHistograms}{#if contribHistograms.shrink}{@html contribHistograms.shrink}{:else}<span class="text-gray-400 dark:text-slate-500 text-xs">データなし</span>{/if}{/if}</div>
      </div>
      <div>
        <div class="text-xs text-gray-600 dark:text-slate-300 mb-1">スコアアップスキル寄与量の分布</div>
        <div id="histogram-scoreup">{#if contribHistograms}{#if contribHistograms.scoreup}{@html contribHistograms.scoreup}{:else}<span class="text-gray-400 dark:text-slate-500 text-xs">データなし</span>{/if}{/if}</div>
      </div>
    </div>
  </section>
  <p id="mc-placeholder" class="text-xs text-gray-400 dark:text-slate-500 text-center py-6" class:hidden={!!simulationResult}>計算を実行するとシミュレーション結果が表示されます</p>
</section>

<div class="bg-white dark:bg-slate-800 rounded-lg shadow">
  <div class="flex border-b overflow-x-auto" role="tablist" aria-label="結果タブ">
    {#each TABS as t (t.key)}
      <button
        type="button"
        data-tab={t.key}
        class="result-tab px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 dark:text-slate-400 hover:text-indigo-600 transition-colors {activeTab === t.key ? 'border-indigo-500 text-indigo-700 bg-indigo-50' : 'border-transparent text-gray-500'}"
        onclick={() => { activeTab = t.key; }}
      >{t.label}</button>
    {/each}
  </div>

  <div id="tab-panel-expected" data-tab-panel class="p-4" class:hidden={activeTab !== 'expected'}>
    <section id="expected-score" class:hidden={!expectedScore}>
      <p class="text-[11px] text-gray-500 dark:text-slate-400 mb-3">外部サイト準拠の単純期待値（シミュレーションの確率的揺れを含まない決定論的な値）</p>
      <table class="w-full text-sm">
        <tbody>
          <tr><td class="text-gray-500 dark:text-slate-400 py-1">属性値による楽曲スコア</td><td id="exp-base" class="text-right py-1">{expectedScore ? expectedScore.baseScore.toLocaleString() : ''}</td></tr>
          <tr><td class="text-gray-500 dark:text-slate-400 py-1">スコアアップ期待値</td><td id="exp-scoreup" class="text-right py-1">{expectedScore ? expectedScore.scoreUpExpected.toLocaleString() : ''}</td></tr>
          <tr><td class="text-gray-500 dark:text-slate-400 py-1">判定縮小期待値</td><td id="exp-shrink" class="text-right py-1">{expectedScore ? expectedScore.shrinkExpected.toLocaleString() : ''}</td></tr>
          <tr class="border-t"><td class="text-gray-500 dark:text-slate-400 py-1">ライブ終了時スコア</td><td id="exp-liveend" class="text-right py-1">{expectedScore ? expectedScore.liveEndScore.toLocaleString() : ''}</td></tr>
          <tr><td class="text-gray-500 dark:text-slate-400 py-1 font-bold">最終リザルト</td><td id="exp-final" class="text-right py-1 font-bold">{expectedScore ? expectedScore.finalScore.toLocaleString() : ''}</td></tr>
        </tbody>
      </table>
    </section>
    <p id="expected-placeholder" class="text-xs text-gray-400 dark:text-slate-500 text-center py-6" class:hidden={!!expectedScore}>計算を実行すると算術期待値が表示されます</p>
  </div>

  <div id="tab-panel-skills" data-tab-panel class="p-4" class:hidden={activeTab !== 'skills'}>
    <section id="skill-stats" class:hidden={!(simulationResult && simulationResult.cardStats.length > 0)}>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-gray-500 dark:text-slate-400 border-b">
              <th class="text-left py-1">衣装名</th>
              <th class="text-left py-1">スキル</th>
              <th class="text-right py-1">発動率</th>
              <th class="text-right py-1">平均発動</th>
              <th class="text-right py-1">スコア寄与</th>
            </tr>
          </thead>
          <tbody id="skill-stats-body">
            {#if simulationResult}
              {#each simulationResult.cardStats as cs}
                <tr class="border-t">
                  <td class="py-1">{cs.cardname}</td>
                  <td class="py-1">{cs.skillType}</td>
                  <td class="py-1 text-right">{cs.theoreticalRate}%</td>
                  <td class="py-1 text-right">{cs.avgActivations.toFixed(1)}回</td>
                  <td class="py-1 text-right">+{Math.round(cs.avgScoreContribution).toLocaleString()}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </section>
    <p id="skills-placeholder" class="text-xs text-gray-400 dark:text-slate-500 text-center py-6" class:hidden={!!(simulationResult && simulationResult.cardStats.length > 0)}>計算を実行するとスキル発動統計が表示されます</p>
  </div>

  <div id="tab-panel-area" data-tab-panel class="p-4" class:hidden={activeTab !== 'area'}>
    <section id="area-values-section" class:hidden={!area}>
      <table class="w-full text-xs">
        <thead>
          <tr class="text-gray-500 dark:text-slate-400">
            <th class="text-left py-1">属性</th>
            <th class="text-right py-1">白ノート</th>
            <th class="text-right py-1">色ノート</th>
            <th class="text-right py-1">合計</th>
          </tr>
        </thead>
        <tbody>
          <tr><td class="py-1 text-red-500 font-medium">Shout</td><td id="area-s-white" class="text-right py-1">{area ? area.s.white.toLocaleString() : ''}</td><td id="area-s-color" class="text-right py-1">{area ? area.s.color.toLocaleString() : ''}</td><td id="area-s-total" class="text-right py-1 font-bold">{area ? (area.s.white + area.s.color).toLocaleString() : ''}</td></tr>
          <tr><td class="py-1 text-green-500 font-medium">Beat</td><td id="area-b-white" class="text-right py-1">{area ? area.b.white.toLocaleString() : ''}</td><td id="area-b-color" class="text-right py-1">{area ? area.b.color.toLocaleString() : ''}</td><td id="area-b-total" class="text-right py-1 font-bold">{area ? (area.b.white + area.b.color).toLocaleString() : ''}</td></tr>
          <tr><td class="py-1 text-blue-500 font-medium">Melody</td><td id="area-m-white" class="text-right py-1">{area ? area.m.white.toLocaleString() : ''}</td><td id="area-m-color" class="text-right py-1">{area ? area.m.color.toLocaleString() : ''}</td><td id="area-m-total" class="text-right py-1 font-bold">{area ? (area.m.white + area.m.color).toLocaleString() : ''}</td></tr>
        </tbody>
      </table>
    </section>
    <p id="area-placeholder" class="text-xs text-gray-400 dark:text-slate-500 text-center py-6" class:hidden={!!area}>楽曲と衣装を設定すると楽曲属性面積値が表示されます</p>
  </div>
</div>
