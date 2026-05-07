<script lang="ts">
  import type { CardListItem } from '../../lib/cardListData';
  import { ATTR_BADGE_BG, ATTR_HEX, RARITY_BADGE_CLASSES } from '../../lib/constants';
  import { EVENT_BONUS_TIERS, type EventBonusTier } from '../../lib/data/eventBonusTiers';
  import CountInput from './CountInput.svelte';

  type Props = {
    card: CardListItem;
    base: string;
    thumbUrl: string;
    bonusTier?: EventBonusTier;
    enableNameFilter?: boolean;
    pageMarker?: number | null;
    onFilterByName?: (name: string) => void;
  };

  let { card, base, thumbUrl, bonusTier, enableNameFilter = false, pageMarker = null, onFilterByName }: Props = $props();

  const borderColor = $derived(ATTR_HEX[card.attribute] || 'transparent');
  const thumb = $derived(`${thumbUrl}/${card.ID}.png`);
  const bonusDef = $derived(bonusTier && bonusTier !== 'none' ? EVENT_BONUS_TIERS.find((t) => t.key === bonusTier) ?? null : null);

  function handleImageClick() {
    window.location.href = `${base}cards/${card.ID}/`;
  }

  function handleNameClick(e: MouseEvent) {
    if (!enableNameFilter) return;
    e.preventDefault();
    e.stopPropagation();
    onFilterByName?.(card.cardname || '');
  }
</script>

<div
  class="bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden flex flex-col"
  style="border-top:3px solid {borderColor}"
  data-page-marker={pageMarker ?? undefined}
>
  <button
    type="button"
    class="block w-full bg-gray-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400"
    onclick={handleImageClick}
    aria-label="{card.cardname || ''} の詳細を表示"
  >
    <img src={thumb} alt={card.cardname || ''} class="w-full h-auto block" loading="lazy" />
  </button>
  <div class="p-2 flex flex-col gap-1 flex-1">
    <div class="flex flex-wrap items-center gap-1">
      <span class="inline-block px-1.5 py-0.5 text-[10px] font-bold text-white rounded {RARITY_BADGE_CLASSES[card.rarity] || 'bg-gray-300'}">
        {card.rarity}
      </span>
      <span class="inline-block px-1.5 py-0.5 text-[10px] font-bold text-white rounded {ATTR_BADGE_BG[card.attribute] || 'bg-gray-300'}">
        {card.attribute || '?'}
      </span>
      {#if bonusDef}
        <span class="inline-block px-1.5 py-0.5 text-[10px] font-bold rounded border {bonusDef.selectClasses.join(' ')}">
          {bonusDef.shortLabel}
        </span>
      {/if}
    </div>
    <p class="font-medium text-sm leading-tight break-words">
      <button
        type="button"
        class="text-left text-indigo-600 hover:underline cursor-pointer bg-transparent p-0 border-0"
        onclick={handleNameClick}
      >{card.cardname || ''}</button>
    </p>
    <p class="text-xs text-gray-500 leading-tight">{card.name || ''}</p>
    <div class="mt-auto flex items-center justify-between border-t pt-1.5">
      <span class="text-[10px] text-gray-500">所持</span>
      <CountInput cardId={card.ID} />
    </div>
  </div>
</div>
