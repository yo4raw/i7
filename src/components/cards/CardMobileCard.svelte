<script lang="ts">
  import type { CardListItem } from '../../lib/cardListData';
  import { ATTR_BADGE_BG, ATTR_BG, ATTR_HEX, RARITY_BADGE_CLASSES } from '../../lib/constants';
  import { EVENT_BONUS_TIERS, type EventBonusTier } from '../../lib/data/eventBonusTiers';
  import { ATTR_TEXT_CLASS } from '../../lib/ui';
  import { attrDonutSvg } from '../../lib/donutChart';
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

  const attrBg = $derived(ATTR_BG[card.attribute] || 'transparent');
  const borderColor = $derived(ATTR_HEX[card.attribute] || 'transparent');
  const thumb = $derived(`${thumbUrl}/${card.ID}.png`);
  const bg = $derived(
    `linear-gradient(to right, rgba(255,255,255,1) 40%, rgba(255,255,255,0.65)), linear-gradient(${attrBg}, ${attrBg}), url(${thumb}) no-repeat right 25% / auto 500%`
  );

  const s = $derived(card.shout_max || 0);
  const b = $derived(card.beat_max || 0);
  const m = $derived(card.melody_max || 0);
  const total = $derived(s + b + m);
  const sPct = $derived(total ? Math.round((s / total) * 100) : 0);
  const bPct = $derived(total ? Math.round((b / total) * 100) : 0);
  const mPct = $derived(total ? Math.round((m / total) * 100) : 0);
  const donut = $derived(attrDonutSvg(s, b, m));

  const bonusDef = $derived(bonusTier && bonusTier !== 'none' ? EVENT_BONUS_TIERS.find((t) => t.key === bonusTier) ?? null : null);

  function handleRowClick() {
    window.location.href = `${base}cards/${card.ID}/`;
  }

  function handleNameClick(e: MouseEvent) {
    if (!enableNameFilter) return;
    e.preventDefault();
    e.stopPropagation();
    onFilterByName?.(card.cardname || '');
  }
</script>

{#if pageMarker != null}
  <div data-page-marker={pageMarker} aria-hidden="true"></div>
{/if}
<div class="rounded-lg shadow p-3 hover:shadow-md transition-shadow" style="border-top:3px solid {borderColor}; background: {bg}">
  <div class="flex gap-3 cursor-pointer" onclick={handleRowClick} role="presentation">
    <div class="flex-shrink-0">
      <img src={thumb} alt="" class="w-12 h-auto rounded" loading="lazy" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1 mb-1">
        <span class="inline-block px-1.5 py-0.5 text-xs font-bold text-white rounded {RARITY_BADGE_CLASSES[card.rarity] || 'bg-gray-300'}">
          {card.rarity}
        </span>
        <span class="inline-block px-1.5 py-0.5 text-xs font-bold text-white rounded {ATTR_BADGE_BG[card.attribute] || 'bg-gray-300'}">
          {card.attribute || '?'}
        </span>
        {#if bonusDef}
          <span class="inline-block px-1.5 py-0.5 text-xs font-bold rounded border {bonusDef.selectClasses.join(' ')}">
            {bonusDef.shortLabel}
          </span>
        {/if}
      </div>
      <p class="font-medium text-sm truncate" onclick={handleNameClick} role="presentation">
        <span class="text-indigo-600 hover:underline cursor-pointer">{card.cardname || ''}</span>
      </p>
      <p class="text-xs text-gray-500">{card.name || ''}</p>
      <div class="flex items-center gap-2 mt-1">
        {@html donut}
        <div class="flex gap-2 text-xs">
          <span class={ATTR_TEXT_CLASS.Shout}>S:{s} <span class="text-gray-400">{sPct}%</span></span>
          <span class={ATTR_TEXT_CLASS.Beat}>B:{b} <span class="text-gray-400">{bPct}%</span></span>
          <span class={ATTR_TEXT_CLASS.Melody}>M:{m} <span class="text-gray-400">{mPct}%</span></span>
        </div>
      </div>
    </div>
  </div>
  <div class="mt-2 flex items-center justify-between border-t pt-2">
    <span class="text-xs text-gray-500">所持数</span>
    <CountInput cardId={card.ID} />
  </div>
</div>
