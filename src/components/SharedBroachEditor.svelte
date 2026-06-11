<script lang="ts">
  import { SHARED_BROACHS, type SharedBroach } from '../lib/data/sharedBroachs';
  import { getBroachCount, setBroachCount, deltaBroachCount, totalOwnedBroachs, MAX_BROACH_COUNT } from '../lib/stores/broachCounts.svelte';

  type GroupKey = 'ALL' | 'Shout' | 'Beat' | 'Melody' | '条件付き';
  const GROUP_ORDER: GroupKey[] = ['ALL', 'Shout', 'Beat', 'Melody', '条件付き'];
  const GROUP_COLORS: Record<GroupKey, string> = {
    ALL: 'border-l-indigo-500',
    Shout: 'border-l-red-500',
    Beat: 'border-l-green-500',
    Melody: 'border-l-blue-500',
    条件付き: 'border-l-purple-500',
  };

  function groupOf(sb: SharedBroach): GroupKey {
    if (sb.targetAttribute) return '条件付き';
    if (sb.shout && sb.beat && sb.melody) return 'ALL';
    if (sb.shout) return 'Shout';
    if (sb.beat) return 'Beat';
    return 'Melody';
  }

  const groups = GROUP_ORDER.map((name) => ({
    name,
    broachs: SHARED_BROACHS.filter((sb) => groupOf(sb) === name),
  }));

  function statsLabel(sb: SharedBroach): string {
    const stats: string[] = [];
    if (sb.shout) stats.push(`S+${sb.shout}`);
    if (sb.beat) stats.push(`B+${sb.beat}`);
    if (sb.melody) stats.push(`M+${sb.melody}`);
    return sb.targetAttribute ? `${sb.targetAttribute}属性枚数 × ${stats.join('/')}` : stats.join('/');
  }

  function onInput(e: Event, id: number) {
    const input = e.currentTarget as HTMLInputElement;
    const v = parseInt(input.value, 10) || 0;
    setBroachCount(id, v);
    input.value = String(getBroachCount(id));
  }

  function onClear() {
    if (!confirm('全ての共通ブローチ所持数をクリアしますか？')) return;
    for (const sb of SHARED_BROACHS) setBroachCount(sb.id, 0);
  }
</script>

<div>
  {#each groups as group (group.name)}
    <section class="bg-white dark:bg-slate-800 rounded-lg shadow mb-4 border-l-4 {GROUP_COLORS[group.name]}">
      <h2 class="text-lg font-bold px-4 pt-4 pb-2">{group.name}</h2>
      <div class="px-4 pb-4 space-y-2">
        {#each group.broachs as sb (sb.id)}
          <div class="flex items-center gap-2 sm:gap-4">
            <span class="font-medium text-sm w-40 sm:w-52 shrink-0 truncate" title={sb.name}>{sb.name}</span>
            <span class="text-xs text-gray-500 dark:text-slate-400 flex-1 truncate">{statsLabel(sb)}</span>
            <div class="flex items-center gap-1 shrink-0">
              <button
                type="button"
                class="w-7 h-7 rounded bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-300 dark:hover:bg-slate-600 text-sm font-bold"
                aria-label="{sb.name} の所持数を減らす"
                data-broach-btn={sb.id}
                data-delta="-1"
                onclick={() => deltaBroachCount(sb.id, -1)}
              >−</button>
              <input
                type="number"
                min="0"
                max={MAX_BROACH_COUNT}
                value={getBroachCount(sb.id)}
                data-broach-input={sb.id}
                aria-label="{sb.name} の所持数"
                class="w-14 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-400"
                onchange={(e) => onInput(e, sb.id)}
              />
              <button
                type="button"
                class="w-7 h-7 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 hover:bg-indigo-200 dark:hover:bg-indigo-800 text-sm font-bold"
                aria-label="{sb.name} の所持数を増やす"
                data-broach-btn={sb.id}
                data-delta="1"
                onclick={() => deltaBroachCount(sb.id, 1)}
              >＋</button>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/each}
</div>

<div class="mt-6 flex items-center gap-3">
  <span class="text-sm text-gray-700 dark:text-slate-200">合計所持数: <b data-broach-total>{totalOwnedBroachs()}</b> 個</span>
  <button type="button" class="px-5 py-2.5 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 shadow-lg text-sm" onclick={onClear}>全てクリア</button>
</div>
<p class="mt-2 text-xs text-gray-400 dark:text-slate-500">入力は即時保存されます。1 種類あたり {MAX_BROACH_COUNT} 個まで登録できます（スコア計算に影響するのは自チーム 5 枠 × 2 個 = 最大 10 個のため）。</p>
