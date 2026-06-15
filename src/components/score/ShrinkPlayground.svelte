<script lang="ts">
  import {
    shrinkTimelineSvg,
    simulateActivationsMulti,
    CARD_COLORS,
    type ShrinkCardParam,
  } from '../../lib/score/specDiagrams';

  const NOTES_COUNT = 428;
  const SONG_DURATION = 104;
  const NOTES_20 = 21;
  const MAX_CARDS = 4;

  // 初期値: 典型的な縮小カード (Card 1952 SL5 相当) × 1 枚
  let cards = $state<ShrinkCardParam[]>([{ count: 20, per: 40, value: 4 }]);
  let seed = $state(7);

  // 倍率 rate は UI では選択式（Lv1〜Lv5）
  let rate = $state(1.6);

  let minCount = $derived(Math.min(...cards.map((c) => c.count)));
  let excludeHead = $derived(Math.max(NOTES_20, minCount));
  let activations = $derived(simulateActivationsMulti({
    cards,
    notesCount: NOTES_COUNT,
    songDuration: SONG_DURATION,
    excludeHead,
    seed,
  }));
  let svg = $derived(shrinkTimelineSvg({
    count: cards[0].count, per: cards[0].per, value: cards[0].value,
    cards,
    notesCount: NOTES_COUNT,
    songDuration: SONG_DURATION,
    excludeHead,
    activations,
  }));

  let firedCount = $derived(activations.filter((a) => a.fired).length);
  let totalTriggers = $derived(activations.length);
  let coveredSec = $derived(
    activations.filter((a) => a.fired).reduce((sum, a, _i) => {
      const c = cards[a.cardIndex ?? 0];
      return sum + (c?.value ?? 0);
    }, 0)
  );
  let coveredSecCapped = $derived(Math.min(coveredSec, SONG_DURATION));
  let coveragePct = $derived(((coveredSecCapped / SONG_DURATION) * 100).toFixed(1));

  function addCard() {
    if (cards.length >= MAX_CARDS) return;
    cards = [...cards, { count: 22, per: 35, value: 4 }];
  }
  function removeCard(i: number) {
    if (cards.length <= 1) return;
    cards = cards.filter((_, idx) => idx !== i);
  }
</script>

<div class="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
  <div class="flex items-center justify-between flex-wrap gap-2">
    <h4 class="text-sm font-bold text-gray-800">縮小スキル {cards.length} 枚構成</h4>
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="px-2 py-1 text-xs rounded border border-indigo-500 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
        onclick={addCard}
        disabled={cards.length >= MAX_CARDS}
        aria-label="縮小スキルを追加"
      >
        ＋衣装追加
      </button>
      <button
        type="button"
        class="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
        onclick={() => (seed = (seed + 1) & 0xffff)}
      >
        別の試行 (seed={seed})
      </button>
    </div>
  </div>

  {#each cards as card, i (i)}
    <div class="bg-white rounded border border-gray-200 p-3">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-bold" style="color: {CARD_COLORS[i]}">
          ■ 衣装 {i + 1}
        </span>
        {#if cards.length > 1}
          <button
            type="button"
            class="text-xs text-gray-500 hover:text-red-600"
            onclick={() => removeCard(i)}
            aria-label="この衣装を削除"
          >
            × 削除
          </button>
        {/if}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <label class="flex flex-col gap-1">
          <span class="font-semibold text-gray-700">
            ノーツ数 <span class="text-gray-500">(count)</span>:
            <span class="text-indigo-600">{card.count}</span>
          </span>
          <input type="range" min="10" max="30" step="1" bind:value={card.count} class="w-full" />
          <span class="text-gray-500">何ノーツ毎に発動判定するか</span>
        </label>
        <label class="flex flex-col gap-1">
          <span class="font-semibold text-gray-700">
            確率 <span class="text-gray-500">(per)</span>:
            <span class="text-indigo-600">{card.per}%</span>
          </span>
          <input type="range" min="5" max="80" step="1" bind:value={card.per} class="w-full" />
          <span class="text-gray-500">判定ごとに発動する確率</span>
        </label>
        <label class="flex flex-col gap-1">
          <span class="font-semibold text-gray-700">
            秒数 <span class="text-gray-500">(value)</span>:
            <span class="text-indigo-600">{card.value}秒</span>
          </span>
          <input type="range" min="1" max="8" step="1" bind:value={card.value} class="w-full" />
          <span class="text-gray-500">発動時の持続秒数</span>
        </label>
      </div>
    </div>
  {/each}

  <div class="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
    <label class="flex items-center gap-1">
      <span class="font-semibold text-gray-700">倍率 <span class="text-gray-500">(rate)</span>:</span>
      <select bind:value={rate} class="border rounded px-1 py-0.5">
        <option value={1.2}>1.2 (Lv1)</option>
        <option value={1.3}>1.3 (Lv2)</option>
        <option value={1.4}>1.4 (Lv3)</option>
        <option value={1.5}>1.5 (Lv4)</option>
        <option value={1.6}>1.6 (Lv5)</option>
      </select>
    </label>
    <span>楽曲: MONSTER GENERATiON ({NOTES_COUNT}ノーツ / {SONG_DURATION}秒)</span>
    <span>先頭除外: <strong class="text-gray-800">{excludeHead}</strong></span>
    <span>
      発動合計: <strong class="text-gray-800">{firedCount}/{totalTriggers}</strong>
    </span>
    <span>
      カバー率: <strong class="text-gray-800">{coveragePct}%</strong>
      ({coveredSecCapped}秒 / {SONG_DURATION}秒)
    </span>
  </div>

  <div class="overflow-x-auto -mx-1 px-1">
    {@html svg}
  </div>

  <p class="text-xs text-gray-500">
    ※ 複数枚構成時は <strong>キューイング仕様</strong>（§2 末尾参照）に従い、先行スキルが終了してから後続スキルが連続発動します（時間軸上で重なりません）。
  </p>
</div>
