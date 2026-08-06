<script lang="ts">
  import { buildCandidates } from '../lib/pointCalc/candidates';
  import { solve, type Solution } from '../lib/pointCalc/solver';
  import { achievableBonusPcts } from '../lib/pointCalc/bonusPresets';
  import {
    BONUS_TIER_KEYS, BONUS_TIER_LABEL, DEFAULT_BONUS_COUNTS, DEFAULT_BONUS_RATES,
    DEFAULT_PLAY_MODES, MAX_BONUS_COUNT, MAX_BONUS_RATE_PCT, MULTIPLIERS, PLAY_MODES,
    UNIT_LABEL, UNIT_PRESETS,
  } from '../lib/pointCalc/constants';
  import type {
    BonusCounts, BonusRates, BonusTierKey, Multiplier, PlayMode, UnitPreset,
  } from '../lib/pointCalc/types';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';

  interface PersistedState {
    targetPt: number | null;
    currentPt: number | null;
    bonusRates: BonusRates;
    bonusCounts: BonusCounts;
    playModes: PlayMode[];
    units: UnitPreset[];
    multipliers: Multiplier[];
  }

  function initialState(): PersistedState {
    return {
      targetPt: null,
      currentPt: null,
      bonusRates: { ...DEFAULT_BONUS_RATES },
      bonusCounts: { ...DEFAULT_BONUS_COUNTS },
      playModes: [...DEFAULT_PLAY_MODES],
      units: [...UNIT_PRESETS],
      multipliers: [...MULTIPLIERS],
    };
  }

  const saved = loadJson<Partial<PersistedState>>(STORAGE_KEYS.POINT_CALC_STATE, {});
  const base = initialState();

  let targetPt = $state<number | null>(saved.targetPt ?? base.targetPt);
  let currentPt = $state<number | null>(saved.currentPt ?? base.currentPt);
  let bonusRates = $state<BonusRates>(saved.bonusRates ?? base.bonusRates);
  let bonusCounts = $state<BonusCounts>(saved.bonusCounts ?? base.bonusCounts);
  let playModes = $state<PlayMode[]>(saved.playModes ?? base.playModes);
  let units = $state<UnitPreset[]>(saved.units ?? base.units);
  let multipliers = $state<Multiplier[]>(saved.multipliers ?? base.multipliers);
  let solutions = $state<Solution[]>([]);
  let calculating = $state(false);
  let message = $state('');

  const diff = $derived((targetPt ?? 0) - (currentPt ?? 0));
  const bonusPcts = $derived(achievableBonusPcts(bonusRates, bonusCounts));

  $effect(() => {
    saveJson(STORAGE_KEYS.POINT_CALC_STATE, {
      targetPt, currentPt, bonusRates, bonusCounts, playModes, units, multipliers,
    } satisfies PersistedState);
  });

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
  }

  /** 入力文字列を 0〜max の整数へ丸める。空欄や不正値は 0 にする */
  function clampInput(raw: string, max: number): number {
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(max, n);
  }

  function setRate(tier: BonusTierKey, raw: string) {
    bonusRates = { ...bonusRates, [tier]: clampInput(raw, MAX_BONUS_RATE_PCT) };
  }

  function setCount(tier: BonusTierKey, raw: string) {
    bonusCounts = { ...bonusCounts, [tier]: clampInput(raw, MAX_BONUS_COUNT) };
  }

  function calculate() {
    message = '';
    solutions = [];
    if (diff <= 0) {
      message = '目標ptが現在ptより大きくなるように入力してください。';
      return;
    }
    const candidates = buildCandidates({ bonusPcts, playModes, units, multipliers });
    if (candidates.length === 0) {
      message = '条件に合うライブがありません。プレイ方法・編成・倍率のいずれかを有効にしてください。';
      return;
    }
    calculating = true;
    // 探索は最悪でも 400ms 程度だが、ボタン押下直後に「計算中」を描画させるため 1 フレーム待つ
    requestAnimationFrame(() => {
      solutions = solve({ diff, candidates });
      calculating = false;
      if (solutions.length === 0) message = '組合せが見つかりませんでした。';
    });
  }

  const fmt = (n: number) => n.toLocaleString('ja-JP');

  function specLabel(solution: Solution, index: number): string {
    const spec = solution.lines[index].specs[0];
    /* v8 ignore next -- specs は必ず 1 件以上入る */
    if (!spec) return '';
    const unit = spec.unit === 'max' ? '' : ` / ${UNIT_LABEL[spec.unit]}`;
    return `★${spec.stars} ${spec.difficulty} / ${spec.playMode} / ${spec.bonusPct}% / ${spec.multiplier}倍${unit}`;
  }
</script>

<section class="surface-card p-4 mb-6">
  <h2 class="text-lg font-bold mb-3">目標</h2>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <label class="block">
      <span class="block text-sm text-gray-600 mb-1">目標pt</span>
      <input
        type="number" min="0" inputmode="numeric" data-testid="target-pt"
        bind:value={targetPt}
        class="w-full border border-gray-300 rounded px-3 py-2 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-chrome-ink"
      />
    </label>
    <label class="block">
      <span class="block text-sm text-gray-600 mb-1">現在のpt</span>
      <input
        type="number" min="0" inputmode="numeric" data-testid="current-pt"
        bind:value={currentPt}
        class="w-full border border-gray-300 rounded px-3 py-2 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-chrome-ink"
      />
    </label>
    <div>
      <span class="block text-sm text-gray-600 mb-1">差異</span>
      <p class="px-3 py-2 text-right text-xl font-bold tabular-nums" data-testid="diff">{fmt(diff)}</p>
    </div>
  </div>
</section>

<section class="surface-card p-4 mb-6">
  <h2 class="text-lg font-bold mb-3">特効</h2>
  <div class="space-y-3">
    <fieldset>
      <legend class="text-sm text-gray-600 mb-1">上昇率</legend>
      <div class="flex flex-wrap gap-4">
        {#each BONUS_TIER_KEYS as tier (tier)}
          <label class="inline-flex items-center gap-1.5 text-sm">
            {BONUS_TIER_LABEL[tier]}
            <input
              type="number" min="0" max={MAX_BONUS_RATE_PCT} inputmode="numeric"
              data-testid="bonus-rate-{tier}"
              value={bonusRates[tier]}
              oninput={(e) => setRate(tier, e.currentTarget.value)}
              class="w-20 border border-gray-300 rounded px-2 py-1 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-chrome-ink"
            />%
          </label>
        {/each}
      </div>
    </fieldset>
    <fieldset>
      <legend class="text-sm text-gray-600 mb-1">使える特効衣装（フレンドから借りる分を含む）</legend>
      <div class="flex flex-wrap gap-4">
        {#each BONUS_TIER_KEYS as tier (tier)}
          <label class="inline-flex items-center gap-1.5 text-sm">
            {BONUS_TIER_LABEL[tier]}
            <input
              type="number" min="0" max={MAX_BONUS_COUNT} inputmode="numeric"
              data-testid="bonus-count-{tier}"
              value={bonusCounts[tier]}
              oninput={(e) => setCount(tier, e.currentTarget.value)}
              class="w-20 border border-gray-300 rounded px-2 py-1 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-chrome-ink"
            />枚
          </label>
        {/each}
      </div>
    </fieldset>
  </div>
  <p class="mt-3 text-sm text-gray-600 text-pretty" data-testid="derived-bonus-pcts">
    使う特効%: {bonusPcts.map(p => `${p}%`).join(' / ')}（{bonusPcts.length} 段階）
  </p>
</section>

<section class="surface-card p-4 mb-6">
  <h2 class="text-lg font-bold mb-3">使ってよい条件</h2>
  <div class="space-y-3">
    <fieldset>
      <legend class="text-sm text-gray-600 mb-1">プレイ方法</legend>
      <div class="flex flex-wrap gap-3">
        {#each PLAY_MODES as mode (mode)}
          <label class="inline-flex items-center gap-1.5 text-sm">
            <input type="checkbox" data-testid="play-mode-{mode}" checked={playModes.includes(mode)} onchange={() => (playModes = toggle(playModes, mode))} />
            {mode}{#if mode === 'PC'}<span class="text-xs text-gray-500">（難度が高いため既定オフ）</span>{/if}
          </label>
        {/each}
      </div>
    </fieldset>
    <fieldset>
      <legend class="text-sm text-gray-600 mb-1">編成</legend>
      <div class="flex flex-wrap gap-3">
        {#each UNIT_PRESETS as unit (unit)}
          <label class="inline-flex items-center gap-1.5 text-sm">
            <input type="checkbox" data-testid="unit-{unit}" checked={units.includes(unit)} onchange={() => (units = toggle(units, unit))} />
            {UNIT_LABEL[unit]}
          </label>
        {/each}
      </div>
    </fieldset>
    <fieldset>
      <legend class="text-sm text-gray-600 mb-1">倍率ライブ</legend>
      <div class="flex flex-wrap gap-3">
        {#each MULTIPLIERS as mul (mul)}
          <label class="inline-flex items-center gap-1.5 text-sm">
            <input type="checkbox" data-testid="multiplier-{mul}" checked={multipliers.includes(mul)} onchange={() => (multipliers = toggle(multipliers, mul))} />
            {mul}倍
          </label>
        {/each}
      </div>
    </fieldset>
  </div>
</section>

<button
  type="button" data-testid="calculate"
  class="px-6 py-3 rounded-lg bg-chrome-ink text-white hover:bg-chrome-ink-soft shadow-lg pressable disabled:opacity-50"
  disabled={calculating}
  onclick={calculate}
>{calculating ? '計算中…' : '組合せを計算する'}</button>

{#if message}
  <p class="mt-4 text-sm text-gray-700" data-testid="message">{message}</p>
{/if}

{#if solutions.length > 0}
  <div class="mt-6 space-y-4" data-testid="solutions">
    {#each solutions as solution, i (i)}
      <section class="surface-card p-4">
        <div class="flex items-baseline gap-3 mb-3">
          <h3 class="text-base font-bold">候補{i + 1}</h3>
          <span class="text-sm text-gray-600 tabular-nums">合計 {fmt(solution.totalCount)} 回</span>
          {#if solution.remainder === 0}
            <span class="rounded-full border border-gray-400 px-2 py-0.5 text-xs font-bold">ぴったり</span>
          {:else}
            <span class="text-xs text-gray-600 tabular-nums">残り {fmt(solution.remainder)} pt</span>
          {/if}
        </div>
        <ul class="space-y-1">
          {#each solution.lines as line, li (line.point)}
            <li class="flex flex-wrap items-baseline gap-x-3 text-sm">
              <span class="flex-1 min-w-48">{specLabel(solution, li)}</span>
              <span class="tabular-nums text-gray-600">{fmt(line.point)} pt × {fmt(line.count)} 回</span>
              <span class="tabular-nums font-medium w-28 text-right">{fmt(line.point * line.count)}</span>
            </li>
          {/each}
        </ul>
        <p class="mt-2 border-t border-gray-200 pt-2 text-sm text-right tabular-nums">
          合計 <b>{fmt(solution.totalPoint)}</b> pt
        </p>
      </section>
    {/each}
  </div>
{/if}
