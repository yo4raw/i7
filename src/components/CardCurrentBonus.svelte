<script lang="ts">
  import { isEventLive, TIER_RANK, EVENT_BONUS_TIERS, type EventBonusTier } from '../lib/data/eventBonusTiers';

  type RelatedEvent = {
    id: number;
    eventname: string;
    start_date: string;
    end_date: string;
    tier: EventBonusTier;
  };

  type Props = {
    relatedEvents: RelatedEvent[];
    base: string;
  };

  let { relatedEvents, base }: Props = $props();

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => { now = Date.now(); }, 30_000);
    return () => clearInterval(id);
  });

  const liveHits = $derived(
    relatedEvents
      .filter((r) => isEventLive(r.start_date, r.end_date, now))
      .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])
  );

  function defFor(tier: EventBonusTier) {
    return EVENT_BONUS_TIERS.find((t) => t.key === tier) ?? null;
  }
</script>

{#if liveHits.length > 0}
  <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
    <h2 class="text-lg font-semibold mb-3">🎯 現在開催中の特効</h2>
    <ul class="space-y-2 text-sm">
      {#each liveHits as h (h.id)}
        {@const def = defFor(h.tier)}
        <li class="flex flex-wrap items-center gap-2">
          {#if def}
            <span class="inline-block px-1.5 py-0.5 text-xs font-bold rounded border {def.selectClasses.join(' ')}">{def.shortLabel}</span>
          {/if}
          <a href={`${base}events/${h.id}/`} class="text-indigo-600 hover:underline font-medium">{h.eventname}</a>
          <span class="text-xs text-gray-500 dark:text-slate-400">{h.start_date} 〜 {h.end_date}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}
