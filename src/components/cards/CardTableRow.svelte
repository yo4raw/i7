<script lang="ts">
  import type { Card } from '../../lib/data/fetchCardsJson';
  import { formatSkillEffectMax } from '../../lib/score/skillFormatter';
  import { ATTR_BG, ATTR_BG_HOVER, ATTR_HEX, characterColor } from '../../lib/constants';
  import { EVENT_BONUS_TIERS, type EventBonusTier } from '../../lib/data/eventBonusTiers';
  import { attrDonutSvg } from '../../lib/donutChart';
  import CountInput from './CountInput.svelte';
  import RarityBadge from '../ui/RarityBadge.svelte';
  import AttributeBadge from '../ui/AttributeBadge.svelte';

  type Props = {
    card: Card;
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
  // キャラ色のスパイン用（name = キャラ名, cardname = 衣装名。取り違え注意）
  const spineColor = $derived(characterColor(card.name || ''));
  const thumb = $derived(`${thumbUrl}/${card.ID}.webp`);
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
  const skillEffect = $derived(formatSkillEffectMax(card as unknown as Card));

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
  <td class="px-3 py-2 relative">
    <span
      class="absolute left-0.5 top-2 bottom-2 w-1 rounded-full pointer-events-none"
      style="background-color:{spineColor}"
      data-testid="character-spine"
      aria-hidden="true"
    ></span>
    <img src={thumb} alt={card.cardname || ''} class="w-12 h-auto rounded" loading="lazy" />
  </td>
  <td class="px-3 py-2">{card.ID}</td>
  <td class="px-3 py-2" onclick={handleNameClick} role="presentation">
    <span class="text-gray-900 hover:underline cursor-pointer">{card.cardname || ''}</span>
  </td>
  <td class="px-3 py-2">{card.name || ''}</td>
  <td class="px-3 py-2">
    <RarityBadge rarity={card.rarity} sizeClass="inline-block px-1.5 py-0.5 text-xs" />
  </td>
  <td class="px-3 py-2">
    <AttributeBadge attribute={card.attribute} sizeClass="inline-block px-1.5 py-0.5 text-xs" />
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
  <td class="px-3 py-2 text-right">{s.toLocaleString()}<div class="text-xs text-gray-400">{sPct}%</div></td>
  <td class="px-3 py-2 text-right">{b.toLocaleString()}<div class="text-xs text-gray-400">{bPct}%</div></td>
  <td class="px-3 py-2 text-right">{m.toLocaleString()}<div class="text-xs text-gray-400">{mPct}%</div></td>
  <td class="px-3 py-2 text-xs">
    <div>{card.ap_skill_type || ''}</div>
    {#if skillEffect}
      <div class="text-[10px] text-gray-500 mt-0.5">
        <span class="font-medium">Lv{skillEffect.level}</span> {skillEffect.text}
      </div>
    {/if}
  </td>
  <td class="px-3 py-2">
    <CountInput cardId={card.ID} />
  </td>
</tr>
