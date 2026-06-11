<script lang="ts">
  import { getApSkillLevel, SKILL_TYPE } from '../../lib/data/fetchCardsJson';
  import type { Card } from '../../lib/data/fetchCardsJson';
  import type { FixedBroach } from '../../lib/data/fetchFixedBroachsJson';
  import type { Song } from '../../lib/data/fetchSongsJson';
  import type { DeckState, SkillLevel } from '../../lib/score/deckState';
  import { SLOT_LABELS, DISPLAY_ORDER } from '../../lib/score/deckState';
  import { resolveDeckBroachs } from '../../lib/score/broachResolver';
  import { EVENT_BONUS_TIERS } from '../../lib/data/eventBonusTiers';
  import type { EventBonusTier } from '../../lib/data/eventBonusTiers';
  import { SHARED_BROACHS } from '../../lib/data/sharedBroachs';
  import type { SharedBroach } from '../../lib/data/sharedBroachs';
  import { ATTR_HEX } from '../../lib/constants';
  import { normalizeAttribute } from '../../lib/score/types';
  import { cardThumbUrl } from '../../lib/ui';
  import RarityBadge from '../ui/RarityBadge.svelte';
  import AttributeBadge from '../ui/AttributeBadge.svelte';

  let { deckState, selectedSong, allBroachs, onSlotClick, onSwap, onChanged }: {
    deckState: DeckState;            // 親の $state proxy（カード配置等の mutate は親側）
    selectedSong: Song | null;
    allBroachs: FixedBroach[];
    /** スロットのタップ（ピッカーを開く） */
    onSlotClick: (slotIndex: number) => void;
    /** D&D でスロット交換が確定した */
    onSwap: (a: number, b: number) => void;
    /** スロット内の select/checkbox 変更。値の更新は子が deckState に直接行い、この通知で親が再計算+保存する */
    onChanged: () => void;
  } = $props();

  let gridEl: HTMLDivElement;
  const slotEls: (HTMLElement | undefined)[] = [];

  // --- 表示計算 ---

  const slotResolvedMap = $derived(
    resolveDeckBroachs(deckState.cards, allBroachs, selectedSong ?? { song_name: '' })
  );

  // 縮小スキルの並び順警告: 発動優先度 メンバー1(idx=1) → センター(idx=0) → メンバー2(idx=2)
  // の順に強い縮小スキルが配置されているかを検証
  const misplacedSlots = $derived.by(() => {
    const PRIORITY_SLOTS = [1, 0, 2] as const;
    const shrinkStrengths = PRIORITY_SLOTS.map(si => {
      const c = deckState.cards[si];
      if (!c) return 0;
      const t = c.ap_skill_type;
      if (!t) return 0;
      const isShrink = t === SKILL_TYPE.SHRINK || t.startsWith(SKILL_TYPE.SHRINK_PREFIX);
      if (!isShrink) return 0;
      const sl = getApSkillLevel(c, deckState.skillLevels[si]);
      return (sl.rate ?? 0) * (sl.per ?? 0);
    });
    const sortedDesc = [...shrinkStrengths].sort((a, b) => b - a);
    const hasAnyShrink = shrinkStrengths.some(v => v > 0);
    const misplaced = new Set<number>();
    if (hasAnyShrink) {
      for (let pi = 0; pi < PRIORITY_SLOTS.length; pi++) {
        if (shrinkStrengths[pi] !== sortedDesc[pi]) {
          misplaced.add(PRIORITY_SLOTS[pi]);
        }
      }
    }
    return misplaced;
  });

  function slotContentClass(i: number, card: Card | null): string {
    if (!card) {
      const isFriend = i === 5;
      return `slot-content border-2 border-dashed ${isFriend ? 'border-amber-300 hover:border-amber-400 hover:bg-amber-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'} rounded-lg p-2 flex flex-col items-center justify-center min-h-[120px] cursor-pointer transition-colors`;
    }
    const cursorClass = i === 5 ? 'cursor-pointer' : 'cursor-grab';
    return `slot-content border-2 border-solid rounded-lg p-1.5 flex flex-col items-center ${cursorClass} min-h-[120px] transition-colors`;
  }

  // 既存実装の踏襲: カード配置時のみ属性色を inline style で設定し、
  // 空スロットに戻った際もリセットしない（renderDeckSlots と同一挙動）
  $effect(() => {
    for (let i = 0; i < 6; i++) {
      const card = deckState.cards[i];
      const el = slotEls[i];
      if (!card || !el) continue;
      const attr = normalizeAttribute(card.attribute);
      el.style.borderColor = ATTR_HEX[attr] || '#6b7280';
    }
  });

  function cardBroachsFor(card: Card): FixedBroach[] {
    return card.rarity === 'UR'
      ? allBroachs.filter(br => br.card_id === card.cardID)
      : [];
  }

  interface BroachLabelView {
    cls: string;
    title: string;
    text: string;
  }

  function broachLabelViews(i: number, cardBroachs: FixedBroach[]): BroachLabelView[] {
    const slotResolved = slotResolvedMap.get(i) ?? [];
    return cardBroachs.map(br => {
      const resolved = slotResolved.find(rb => rb.broach.id === br.id);
      const isActive = resolved?.active ?? false;
      const mult = (isActive ? resolved?.multiplier : 1) ?? 1;

      const stats: string[] = [];
      if (br.shout) stats.push(`S+${(br.shout * mult).toLocaleString()}`);
      if (br.beat) stats.push(`B+${(br.beat * mult).toLocaleString()}`);
      if (br.melody) stats.push(`M+${(br.melody * mult).toLocaleString()}`);
      if (br.score) stats.push(`スコア+${br.score}`);
      const statStr = stats.join('/');
      const baseLabel = br.condition
        ? `${br.condition}${statStr ? ' ' + statStr : ''}`
        : statStr || `ブローチ#${br.id}`;
      const label = br.broach_type === 5 && isActive && mult > 1
        ? `${baseLabel}（${mult}枚）`
        : baseLabel;

      const isAutoOnly = br.broach_type === 8;

      if (isAutoOnly) {
        return {
          cls: 'mt-1 w-full text-[8px] bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-1 py-0.5 text-gray-400 dark:text-slate-500 truncate text-center line-through',
          title: `${label}（オート専用・計算対象外）`,
          text: `🔮 ${label}（オート専用）`,
        };
      } else if (isActive) {
        return {
          cls: 'mt-1 w-full text-[8px] bg-purple-50 border border-purple-200 rounded px-1 py-0.5 text-purple-700 truncate text-center',
          title: label,
          text: `🔮 ${label}`,
        };
      } else {
        return {
          cls: 'mt-1 w-full text-[8px] bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-1 py-0.5 text-gray-400 dark:text-slate-500 truncate text-center',
          title: `${label}（条件未達）`,
          text: `🔮 ${label}`,
        };
      }
    });
  }

  function sharedBroachOptionLabel(sb: SharedBroach): string {
    const stats: string[] = [];
    if (sb.shout) stats.push(`S+${sb.shout}`);
    if (sb.beat) stats.push(`B+${sb.beat}`);
    if (sb.melody) stats.push(`M+${sb.melody}`);
    const cond = sb.targetAttribute ? `${sb.targetAttribute}属性` : '';
    return cond ? `${sb.name} (${cond} ${stats.join('/')})` : `${sb.name} (${stats.join('/')})`;
  }

  function bonusTierSelectClass(tier: EventBonusTier): string {
    const base = 'bonus-tier-select mt-1 w-full text-[9px] border border-gray-300 dark:border-slate-600 rounded px-0.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400';
    const def = EVENT_BONUS_TIERS.find(t => t.key === tier);
    return def && def.selectClasses.length > 0 ? `${base} ${def.selectClasses.join(' ')}` : base;
  }

  const SHRINK_WARNING_TITLE = '縮小スキルの並び順が最適ではありません。発動優先度はメンバー1 → センター → メンバー2 の順なので、強い縮小スキル（倍率×発動率）ほど優先度の高いスロットに配置するとスコアが伸びやすくなります。';

  const IMG_FALLBACK_SRC = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 67%22><rect width=%2248%22 height=%2267%22 fill=%22%23e5e7eb%22/></svg>';

  function onImgError(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    img.onerror = null;
    img.src = IMG_FALLBACK_SRC;
  }

  function stopProp(e: Event) {
    e.stopPropagation();
  }

  // --- change ハンドラ（値の mutate は子で行い、onChanged で親に通知する） ---

  function onBonusTierChange(e: Event, slot: number) {
    const sel = e.currentTarget as HTMLSelectElement;
    deckState.bonusTiers[slot] = sel.value as EventBonusTier;
    onChanged();
  }

  function onTrainedChange(e: Event, slot: number) {
    const chk = e.currentTarget as HTMLInputElement;
    deckState.trained[slot] = chk.checked;
    onChanged();
  }

  function onSkillLevelChange(e: Event, slot: number) {
    const sel = e.currentTarget as HTMLSelectElement;
    deckState.skillLevels[slot] = Number(sel.value) as SkillLevel;
    onChanged();
  }

  function onSharedBroachChange(e: Event, slot: number, idx: number) {
    const sel = e.currentTarget as HTMLSelectElement;
    const val = Number(sel.value);
    if (!deckState.sharedBroachs[slot]) deckState.sharedBroachs[slot] = [];
    while (deckState.sharedBroachs[slot].length <= idx) deckState.sharedBroachs[slot].push(0);
    deckState.sharedBroachs[slot][idx] = val;
    onChanged();
  }

  // --- D&D ---

  const DRAG_THRESHOLD = 6;
  const DRAG_DROP_HIGHLIGHT = ['ring-2', 'ring-indigo-400', 'ring-offset-1'];

  function clearDropHighlight() {
    gridEl.querySelectorAll<HTMLElement>('[data-slot-btn]').forEach(el => {
      el.classList.remove(...DRAG_DROP_HIGHLIGHT);
    });
  }

  function findDropTargetSlot(x: number, y: number): number | null {
    const elem = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!elem) return null;
    const slotEl = elem.closest<HTMLElement>('[data-slot-btn]');
    if (!slotEl) return null;
    const slot = Number(slotEl.dataset.slotBtn);
    if (Number.isNaN(slot)) return null;
    return slot;
  }

  function highlightDropTarget(x: number, y: number, sourceSlot: number) {
    clearDropHighlight();
    const target = findDropTargetSlot(x, y);
    if (target === null || target === sourceSlot || target === 5) return;
    const targetEl = gridEl.querySelector<HTMLElement>(`[data-slot-btn="${target}"]`);
    if (targetEl) targetEl.classList.add(...DRAG_DROP_HIGHLIGHT);
  }

  let activeDragGhost: HTMLElement | null = null;
  let activeDragGhostSize: { w: number; h: number } | null = null;

  function createDragGhost(src: HTMLElement, x: number, y: number): HTMLElement {
    const rect = src.getBoundingClientRect();
    const ghost = src.cloneNode(true) as HTMLElement;
    ghost.style.position = 'fixed';
    ghost.style.left = '0';
    ghost.style.top = '0';
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.75';
    ghost.style.zIndex = '9999';
    ghost.style.transform = `translate3d(${x - rect.width / 2}px, ${y - rect.height / 2}px, 0)`;
    ghost.style.transition = 'none';
    ghost.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.25)';
    document.body.appendChild(ghost);
    activeDragGhost = ghost;
    activeDragGhostSize = { w: rect.width, h: rect.height };
    return ghost;
  }

  function moveDragGhost(x: number, y: number) {
    if (!activeDragGhost || !activeDragGhostSize) return;
    const { w, h } = activeDragGhostSize;
    activeDragGhost.style.transform = `translate3d(${x - w / 2}px, ${y - h / 2}px, 0)`;
  }

  function destroyDragGhost() {
    if (activeDragGhost) {
      activeDragGhost.remove();
      activeDragGhost = null;
      activeDragGhostSize = null;
    }
  }

  function onSlotPointerDown(ev: PointerEvent, slot: number) {
    if (ev.button !== undefined && ev.button !== 0) return;
    const el = ev.currentTarget as HTMLElement;
    const t = ev.target as HTMLElement;
    if (t.closest('select, input, label.trained-label')) return;

    const startX = ev.clientX;
    const startY = ev.clientY;
    const isFriend = slot === 5;
    const hasCard = deckState.cards[slot] !== null;
    let dragging = false;
    let pointerId = ev.pointerId;

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (isFriend || !hasCard) return;
        dragging = true;
        try { el.setPointerCapture(pointerId); } catch { /* noop */ }
        createDragGhost(el, e.clientX, e.clientY);
        document.body.style.cursor = 'grabbing';
        el.style.opacity = '0.4';
      }
      moveDragGhost(e.clientX, e.clientY);
      highlightDropTarget(e.clientX, e.clientY, slot);
    };

    const finish = (e: PointerEvent | null, dropped: boolean) => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      try { el.releasePointerCapture(pointerId); } catch { /* noop */ }
      clearDropHighlight();
      destroyDragGhost();
      document.body.style.cursor = '';
      el.style.opacity = '';
      if (!dragging) {
        onSlotClick(slot);
        return;
      }
      if (!dropped || !e) return;
      const target = findDropTargetSlot(e.clientX, e.clientY);
      if (target === null || target === slot || target === 5) return;
      onSwap(slot, target);
    };

    const onUp = (e: PointerEvent) => finish(e, true);
    const onCancel = (e: PointerEvent) => finish(e, false);

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
  }
</script>

<div class="grid grid-cols-3 sm:grid-cols-6 gap-2" id="deck-slots" bind:this={gridEl}>
  {#each DISPLAY_ORDER as i (i)}
    {@const card = deckState.cards[i]}
    <div class="deck-slot" data-slot={i}>
      <div class="text-[10px] text-center {i === 0 ? 'text-indigo-600 font-bold' : i === 5 ? 'text-amber-600 font-bold' : 'text-gray-500 dark:text-slate-400'} mb-1">{SLOT_LABELS[i]}</div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class={slotContentClass(i, card)}
        data-slot-btn={i}
        style:touch-action="none"
        bind:this={slotEls[i]}
        onpointerdown={(e) => onSlotPointerDown(e, i)}
      >
        {#if card}
          {@const attr = normalizeAttribute(card.attribute)}
          {@const cardBroachs = cardBroachsFor(card)}
          {@const maxShared = cardBroachs.length > 0 ? 1 : 2}
          <img
            src={cardThumbUrl(card.ID!)}
            alt={card.cardname || ''}
            class="w-full max-w-[60px] h-auto rounded mb-1"
            onerror={onImgError}
            loading="lazy"
          />
          <div class="flex gap-0.5 mb-1">
            <RarityBadge rarity={card.rarity} sizeClass="px-1 py-0.5 text-[9px]" fallbackLabel="?" />
            <AttributeBadge attribute={attr} sizeClass="px-1 py-0.5 text-[9px]" />
          </div>
          <div class="text-[9px] text-gray-600 dark:text-slate-300 text-center truncate w-full" title={card.cardname || ''}>{card.cardname || ''}</div>
          <div class="text-[8px] text-gray-400 dark:text-slate-500 text-center">{card.name || ''}</div>
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
          <label class="trained-label mt-1 flex items-center gap-1 text-[9px] text-gray-600 dark:text-slate-300 cursor-pointer" onclick={stopProp}>
            <input type="checkbox" class="trained-check w-3 h-3" data-trained-slot={i} checked={deckState.trained[i]} onchange={(e) => onTrainedChange(e, i)} />
            <span>特訓済</span>
          </label>
          <select class={bonusTierSelectClass(deckState.bonusTiers[i])} data-bonus-slot={i} value={deckState.bonusTiers[i]} onclick={stopProp} onchange={(e) => onBonusTierChange(e, i)}>
            {#each EVENT_BONUS_TIERS as t (t.key)}
              <option value={t.key}>{t.optionLabel}</option>
            {/each}
          </select>
          <select class="skill-level-select mt-1 w-full text-[9px] border border-gray-300 dark:border-slate-600 rounded px-0.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" data-skill-slot={i} value={deckState.skillLevels[i]} onclick={stopProp} onchange={(e) => onSkillLevelChange(e, i)}>
            {#each [1, 2, 3, 4, 5] as lv (lv)}
              <option value={lv}>スキルLv{lv}</option>
            {/each}
          </select>
          {#if misplacedSlots.has(i)}
            <div class="mt-1 w-full text-[8px] bg-amber-50 border border-amber-300 rounded px-1 py-0.5 text-amber-700 text-center" title={SHRINK_WARNING_TITLE}>⚠️ 並び順</div>
          {/if}
          {#each broachLabelViews(i, cardBroachs) as bl}
            <div class={bl.cls} title={bl.title}>{bl.text}</div>
          {/each}
          {#if card.rarity === 'UR'}
            {#each Array.from({ length: maxShared }) as _, s}
              <select
                class="shared-broach-select mt-1 w-full text-[8px] border border-purple-300 rounded px-0.5 py-0.5 bg-purple-50 text-purple-700 focus:outline-none focus:ring-1 focus:ring-purple-400"
                data-broach-slot={i}
                data-broach-idx={s}
                value={deckState.sharedBroachs[i]?.[s] ?? 0}
                onclick={stopProp}
                onchange={(e) => onSharedBroachChange(e, i, s)}
              >
                <option value={0}>共通ブローチ{maxShared > 1 ? (s + 1) : ''}を選択</option>
                {#each SHARED_BROACHS as sb (sb.id)}
                  <option value={sb.id}>{sharedBroachOptionLabel(sb)}</option>
                {/each}
              </select>
            {/each}
          {/if}
        {:else}
          <svg class="w-8 h-8 {i === 5 ? 'text-amber-300' : 'text-gray-300'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          <span class="text-[10px] {i === 5 ? 'text-amber-400' : 'text-gray-400'} mt-1">選択</span>
        {/if}
      </div>
    </div>
  {/each}
</div>
