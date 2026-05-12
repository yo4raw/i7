<script lang="ts">
  import type { CardListItem } from '../../lib/cardListData';
  import { ATTR_BADGE_BG, ATTR_BG, ATTR_BG_HOVER, ATTR_HEX, RARITY_BADGE_CLASSES } from '../../lib/constants';
  import { EVENT_BONUS_TIERS, type EventBonusTier } from '../../lib/data/eventBonusTiers';
  import { attrDonutSvg } from '../../lib/donutChart';
  import CountInput from './CountInput.svelte';

  type Props = {
    card: CardListItem;
    base: string;
    thumbUrl: string;
    bonusTier?: EventBonusTier;
    enableNameFilter?: boolean;
    showBonusCell?: boolean;
    pageMarker?: number | null;
    onFilterByName?: (name: string) => void;
  };

  let {
    card,
    base,
    thumbUrl,
    bonusTier,
    enableNameFilter = false,
    showBonusCell = false,
    pageMarker = null,
    onFilterByName,
  }: Props = $props();

  const attrBg = $derived(ATTR_BG[card.attribute] || 'transparent');
  const attrBgHover = $derived(ATTR_BG_HOVER[card.attribute] || 'rgba(0,0,0,0.04)');
  const borderColor = $derived(ATTR_HEX[card.attribute] || 'transparent');
  const thumb = $derived(`${thumbUrl}/${card.ID}.png`);
  const rowBg = $derived(
    `linear-gradient(to right, rgba(255,255,255,1) 40%, rgba(255,255,255,0.92) 60%, rgba(255,255,255,0.55)), linear-gradient(${attrBg}, ${attrBg}), url(${thumb}) no-repeat right 25% / 50% auto`
  );
  const rowBgHover = $derived(
    `linear-gradient(to right, rgba(255,255,255,1) 40%, rgba(255,255,255,0.92) 60%, rgba(255,255,255,0.55)), linear-gradient(${attrBgHover}, ${attrBgHover}), url(${thumb}) no-repeat right 25% / 50% auto`
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

  let rowBgCurrent = $state(rowBg);
  $effect(() => { rowBgCurrent = rowBg; });

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
  <tr data-page-marker={pageMarker} aria-hidden="true" style="height:0"><td colspan="13" style="height:0;padding:0;border:0"></td></tr>
{/if}
<tr
  class="cursor-pointer"
  style="border-top:2px solid {borderColor}; background: {rowBgCurrent}"
  onmouseenter={() => (rowBgCurrent = rowBgHover)}
  onmouseleave={() => (rowBgCurrent = rowBg)}
  onclick={handleRowClick}
>
  <td class="px-3 py-2">
    <img src={thumb} alt={card.cardname || ''} class="w-12 h-auto rounded" loading="lazy" />
  </td>
  <td class="px-3 py-2">{card.ID}</td>
  <td class="px-3 py-2" onclick={handleNameClick} role="presentation">
    <span class="text-indigo-600 hover:underline cursor-pointer">{card.cardname || ''}</span>
  </td>
  <td class="px-3 py-2">{card.name || ''}</td>
  <td class="px-3 py-2">
    <span class="inline-block px-1.5 py-0.5 text-xs font-bold text-white rounded {RARITY_BADGE_CLASSES[card.rarity] || 'bg-gray-300'}">
      {card.rarity}
    </span>
  </td>
  <td class="px-3 py-2">
    <span class="inline-block px-1.5 py-0.5 text-xs font-bold text-white rounded {ATTR_BADGE_BG[card.attribute] || 'bg-gray-300'}">
      {card.attribute || '?'}
    </span>
  </td>
  {#if showBonusCell}
    <td class="px-3 py-2 bonus-cell">
      {#if bonusDef}
        <span class="inline-block px-1.5 py-0.5 text-xs font-bold rounded border {bonusDef.selectClasses.join(' ')}">
          {bonusDef.shortLabel}
        </span>
      {/if}
    </td>
  {/if}
  <td class="px-3 py-2">{@html donut}</td>
  <td class="px-3 py-2 text-right">{s.toLocaleString()}<div class="text-xs text-gray-400 dark:text-slate-500">{sPct}%</div></td>
  <td class="px-3 py-2 text-right">{b.toLocaleString()}<div class="text-xs text-gray-400 dark:text-slate-500">{bPct}%</div></td>
  <td class="px-3 py-2 text-right">{m.toLocaleString()}<div class="text-xs text-gray-400 dark:text-slate-500">{mPct}%</div></td>
  <td class="px-3 py-2 text-xs">{card.ap_skill_type || ''}</td>
  <td class="px-3 py-2">
    <CountInput cardId={card.ID} />
  </td>
</tr>
