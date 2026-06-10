<script lang="ts">
  import { ATTR_BADGE_BG, RARITY_BADGE_CLASSES } from '../lib/constants';
  import { getCount } from '../lib/stores/cardCounts.svelte';
  import { cardThumbUrl } from '../lib/ui';
  import CountInput from './cards/CountInput.svelte';

  interface EventBonusCardItem {
    ID: number;
    cardname: string;
    name: string;
    attribute: string;
    rarity: string;
  }

  type Props = {
    label: string;
    badgeClass: string;
    effectSummary?: string;
    targetNote?: string;
    cards: EventBonusCardItem[];
    base: string;
  };

  let { label, badgeClass, effectSummary = '', targetNote = '', cards, base }: Props = $props();

  // 所持枚数合計（同一衣装の重複所持を含む）。getCount がストアを読むため $derived で即時連動する
  const owned = $derived(cards.reduce((sum, c) => sum + getCount(c.ID), 0));
</script>

<div class="flex items-center justify-between gap-2 flex-wrap mb-3">
  <span class={`inline-block px-3 py-1 rounded text-sm font-bold border ${badgeClass}`}>{label}</span>
  <span class="text-xs text-gray-500 dark:text-slate-400">対象 {cards.length} 枚 ・ 所持 {owned} 枚</span>
</div>

{#if effectSummary}
  <p class="text-sm text-gray-700 dark:text-slate-200 mb-2">{effectSummary}</p>
{/if}
{#if targetNote}
  <p class="text-xs text-gray-500 dark:text-slate-400 mb-3">対象: {targetNote}</p>
{/if}

{#if cards.length === 0}
  <p class="text-sm text-gray-400 dark:text-slate-500">対象衣装なし</p>
{:else}
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
    {#each cards as card (card.ID)}
      <div class="flex flex-col p-2 rounded border border-gray-200 dark:border-slate-700">
        <a
          href={`${base}cards/${card.ID}/`}
          class="flex items-center gap-2 rounded hover:bg-gray-50 dark:hover:bg-slate-900 transition-colors"
        >
          <img
            src={cardThumbUrl(card.ID)}
            alt={card.cardname}
            class="w-12 h-auto rounded flex-shrink-0"
            loading="lazy"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1 mb-0.5">
              <span class={`px-1 py-0.5 text-[9px] font-bold text-white rounded ${RARITY_BADGE_CLASSES[card.rarity] || 'bg-gray-300'}`}>{card.rarity || '?'}</span>
              {#if card.attribute}
                <span class={`px-1 py-0.5 text-[9px] font-bold text-white rounded ${ATTR_BADGE_BG[card.attribute] || 'bg-gray-400'}`}>{card.attribute}</span>
              {/if}
            </div>
            <div class="text-xs font-medium truncate text-gray-800 dark:text-slate-100">{card.cardname || '-'}</div>
            <div class="text-[11px] text-gray-500 dark:text-slate-400 truncate">{card.name}</div>
          </div>
        </a>
        <div class="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <span class="text-[10px] text-gray-500 dark:text-slate-400">所持</span>
          <CountInput cardId={card.ID} />
        </div>
      </div>
    {/each}
  </div>
{/if}
