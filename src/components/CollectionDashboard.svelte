<script lang="ts">
  import type { Card } from '../lib/data/fetchCardsJson';
  import { CHARACTER_GROUPS, RARITIES, ATTR_HEX, ATTR_BADGE_BG, RARITY_BADGE_CLASSES } from '../lib/constants';
  import { allCounts, totalOwned } from '../lib/stores/cardCounts.svelte';
  import { attrDonutSvg } from '../lib/donutChart';

  type Props = { cards: Card[] };
  let { cards }: Props = $props();

  const ownedIds = $derived(new Set(Object.entries(allCounts()).filter(([, n]) => n > 0).map(([k]) => k)));
  const isOwned = (c: Card) => c.ID !== null && c.ID !== undefined && ownedIds.has(String(c.ID));

  /** owned / total と達成率% を算出 */
  function rate(pool: Card[]) {
    const total = pool.length;
    const owned = pool.filter((c) => isOwned(c)).length;
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
    return { owned, total, pct };
  }

  const urCards = $derived(cards.filter((c) => c.rarity === 'UR'));
  const overallUr = $derived(rate(urCards));
  const overallAll = $derived(rate(cards));
  const totalCount = $derived(totalOwned());

  // レアリティ別（種類ベース）
  const byRarity = $derived(
    RARITIES.map((r) => ({ rarity: r, ...rate(cards.filter((c) => c.rarity === r)) }))
  );

  // キャラ別 UR 達成率（グループごと）
  const byGroup = $derived(
    CHARACTER_GROUPS.map((g) => ({
      name: g.name,
      members: g.members.map((m) => ({ name: m, ...rate(urCards.filter((c) => c.name === m)) })),
      ...rate(urCards.filter((c) => (g.members as readonly string[]).includes(c.name ?? ''))),
    }))
  );

  // 所持衣装の属性バランス（種類ベース）
  const ownedByAttr = $derived.by(() => {
    let s = 0, b = 0, m = 0;
    for (const c of cards) {
      if (!isOwned(c)) continue;
      if (c.attribute === 'Shout') s++;
      else if (c.attribute === 'Beat') b++;
      else if (c.attribute === 'Melody') m++;
    }
    return { s, b, m, total: s + b + m };
  });
  const attrDonut = $derived(
    ownedByAttr.total > 0
      ? attrDonutSvg(ownedByAttr.s, ownedByAttr.b, ownedByAttr.m, { sizeClass: 'w-28 h-28', strokeWidth: 4 })
      : ''
  );
</script>

<section class="surface-card p-4 mb-6" data-testid="collection-dashboard">
  <h2 class="text-lg font-bold text-gray-800 mb-3">コレクション状況</h2>

  <!-- 総括 -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
    <div class="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div class="text-[11px] text-amber-700 font-medium">UR 収集率</div>
      <div class="text-2xl font-bold tabular-nums text-amber-700">{overallUr.pct}%</div>
      <div class="text-[11px] text-gray-500">{overallUr.owned} / {overallUr.total} 種</div>
    </div>
    <div class="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
      <div class="text-[11px] text-indigo-700 font-medium">全レアリティ収集率</div>
      <div class="text-2xl font-bold tabular-nums text-indigo-700">{overallAll.pct}%</div>
      <div class="text-[11px] text-gray-500">{overallAll.owned} / {overallAll.total} 種</div>
    </div>
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div class="text-[11px] text-gray-600 font-medium">所持種類</div>
      <div class="text-2xl font-bold tabular-nums text-gray-800">{overallAll.owned}</div>
      <div class="text-[11px] text-gray-500">種</div>
    </div>
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div class="text-[11px] text-gray-600 font-medium">合計枚数</div>
      <div class="text-2xl font-bold tabular-nums text-gray-800">{totalCount.toLocaleString()}</div>
      <div class="text-[11px] text-gray-500">枚</div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- レアリティ別 -->
    <div>
      <h3 class="text-sm font-bold text-gray-700 mb-2">レアリティ別 収集率</h3>
      <div class="space-y-1.5">
        {#each byRarity as r (r.rarity)}
          <div class="flex items-center gap-2 text-xs">
            <span class={`inline-block w-9 text-center text-white rounded text-[10px] py-0.5 font-bold ${RARITY_BADGE_CLASSES[r.rarity] ?? 'bg-gray-400'}`}>{r.rarity}</span>
            <div class="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
              <div class="h-full bg-indigo-400" style={`width:${r.pct}%`}></div>
            </div>
            <span class="w-24 text-right text-gray-600 tabular-nums">{r.owned}/{r.total}（{r.pct}%）</span>
          </div>
        {/each}
      </div>

      <h3 class="text-sm font-bold text-gray-700 mt-5 mb-2">所持衣装の属性バランス</h3>
      {#if ownedByAttr.total > 0}
        <div class="flex items-center gap-4">
          <div>{@html attrDonut}</div>
          <div class="text-xs space-y-1">
            <div class="flex items-center gap-1.5"><span class={`w-2.5 h-2.5 rounded-sm ${ATTR_BADGE_BG.Shout}`}></span>Shout {ownedByAttr.s}種</div>
            <div class="flex items-center gap-1.5"><span class={`w-2.5 h-2.5 rounded-sm ${ATTR_BADGE_BG.Beat}`}></span>Beat {ownedByAttr.b}種</div>
            <div class="flex items-center gap-1.5"><span class={`w-2.5 h-2.5 rounded-sm ${ATTR_BADGE_BG.Melody}`}></span>Melody {ownedByAttr.m}種</div>
          </div>
        </div>
      {:else}
        <p class="text-xs text-gray-400">所持衣装がありません</p>
      {/if}
    </div>

    <!-- キャラ別 UR 達成率 -->
    <div>
      <h3 class="text-sm font-bold text-gray-700 mb-2">キャラクター別 UR 収集率</h3>
      <div class="space-y-3">
        {#each byGroup as g (g.name)}
          <div>
            <div class="flex items-center justify-between text-xs font-bold text-gray-600 mb-1">
              <span>{g.name}</span>
              <span class="text-gray-400 tabular-nums">{g.owned}/{g.total}（{g.pct}%）</span>
            </div>
            <div class="space-y-1">
              {#each g.members as m (m.name)}
                <div class="flex items-center gap-2 text-[11px]">
                  <span class="w-24 truncate text-gray-600">{m.name}</span>
                  <div class="flex-1 h-2.5 bg-gray-100 rounded overflow-hidden">
                    <div class="h-full" style={`width:${m.pct}%;background:${ATTR_HEX.Beat}`}></div>
                  </div>
                  <span class="w-16 text-right text-gray-500 tabular-nums">{m.owned}/{m.total}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>
