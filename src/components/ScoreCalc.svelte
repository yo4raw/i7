<script lang="ts">
  import { onMount } from 'svelte';
  import { getApSkillLevel, SKILL_TYPE, type Card } from '../lib/data/fetchCardsJson';
  import { formatSkillEffect } from '../lib/score/skillFormatter';
  import type { Song } from '../lib/data/fetchSongsJson';
  import type { FixedBroach } from '../lib/data/fetchFixedBroachsJson';
  import type { ComputedTeam, SimulationResult, ScoreOptions, FlatNote } from '../lib/score/types';
  import { computeTeam, calcMinScore, calcMaxScore, calcShrinkCoverage, calcExpectedScore, calcCardSkillExpected, calcCardSkillMax, calcCardSkillMaxActivations, runSimulation, flattenNotes, getCenterSkillRate, computeShrinkExclusion, computeGroupSizes } from '../lib/score/engine';
  import { resolveDeckBroachs } from '../lib/score/broachResolver';
  import { MC_ITERATIONS, NOTE_RATE, LIGHT_MULTIPLIER, TRAIN_BONUS, SCOREUP_ASSIST_RATE } from '../lib/score/constants';
  import { EVENT_BONUS_TIERS, EVENT_BONUS_MULTIPLIER, BONUS_LABEL, BONUS_CLASS, ALL_SELECT_CLASSES, buildLiveTierMap } from '../lib/data/eventBonusTiers';
  import type { EventBonusTier, EventForBonus } from '../lib/data/eventBonusTiers';
  import { renderHistogramSvg } from '../lib/score/histogram';
  import { attrDonutSvg } from '../lib/donutChart';
  import { ATTR_HEX, RARITY_BADGE_CLASSES, ATTR_BADGE_BG } from '../lib/constants';
  import { normalizeAttribute } from '../lib/score/types';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';
  import { ATTR_TEXT_CLASS, cardThumbUrl } from '../lib/ui';
  import { SHARED_BROACHS } from '../lib/data/sharedBroachs';
  import { loadRabbitNotes } from '../lib/data/rabbitNote';
  import { refreshData } from '../lib/data/clientRefresh';
  import { fetchCardsJson } from '../lib/data/fetchCardsJson';
  import { cardTextMatches } from '../lib/cardFilter';
  import { fetchSongsJson, filterValidSongs, filterAllowedSongs, SONG_NOTE_GROUP_KEYS } from '../lib/data/fetchSongsJson';
  import { fetchFixedBroachsJson } from '../lib/data/fetchFixedBroachsJson';
  import { encodeDeckToParams, decodeParamsToDeck, isDeckEmpty } from '../lib/score/deckShareUrl';
  import { createEmptyDeckState, swapSlots, clampSharedBroachs, setCard, clearSlot, SLOT_LABELS, DISPLAY_ORDER } from '../lib/score/deckState';
  type Props = {
    cards: Card[];
    songs: Song[];
    broachs: FixedBroach[];
    events: EventForBonus[];
    base: string;
  };

  let { cards: initialCards, songs: initialSongs, broachs: initialBroachs, events: initialEvents, base }: Props = $props();

  const deckState = $state(createEmptyDeckState());

  let rootEl: HTMLDivElement;

  // カード所持数のヘルパ（cardListRenderer由来の関数と同等）
  function loadCounts(): Record<string, number> {
    return loadJson<Record<string, number>>(STORAGE_KEYS.CARD_COUNTS, {});
  }

  onMount(() => {
    let allCards: Card[] = initialCards;
    let allSongs: Song[] = initialSongs;
    let allBroachs: FixedBroach[] = initialBroachs;
    const allEventsForBonus: EventForBonus[] = initialEvents;

    const defaultTierMap = buildLiveTierMap(allEventsForBonus);

    function defaultTierFor(card: Card | null): EventBonusTier {
      if (!card || card.ID == null) return 'none';
      return defaultTierMap.get(card.ID) ?? 'none';
    }

    const _q = <T extends HTMLElement = HTMLElement>(id: string): T => rootEl.querySelector<T>(`#${id}`) as T;

    let selectedSong: Song | null = null;
    let activeModalSlot = -1;
    let simulationResult: SimulationResult | null = null;

    function getSelectedSongIds(): Set<number> {
      return new Set(loadJson<number[]>(STORAGE_KEYS.SELECTED_SONGS, []));
    }

    function rebuildSongSelect() {
      const sel = _q<HTMLSelectElement>('song-select');
      while (sel.children.length > 1) sel.removeChild(sel.lastChild!);
      const pickedIds = getSelectedSongIds();
      const pickedSongs = allSongs
        .filter(s => s.id != null && pickedIds.has(s.id))
        .sort((a, b) => (a.duration || 0) - (b.duration || 0));
      if (pickedSongs.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = `選択中の曲（${pickedSongs.length}曲・秒数順）`;
        for (const s of pickedSongs) {
          const opt = document.createElement('option');
          opt.value = String(s.id);
          opt.textContent = `${s.song_name} (${s.difficulty || ''}) - ${s.duration || '?'}秒`;
          optgroup.appendChild(opt);
        }
        sel.appendChild(optgroup);
      }
      const groups = new Map<string, Song[]>();
      for (const s of allSongs) {
        const cat = s.category || 'その他';
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat)!.push(s);
      }
      for (const [cat, songs] of groups) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = cat;
        for (const s of songs) {
          const opt = document.createElement('option');
          opt.value = String(s.id);
          opt.textContent = `${s.song_name} (${s.difficulty || ''})`;
          optgroup.appendChild(opt);
        }
        sel.appendChild(optgroup);
      }
    }

    function initSongSelect() {
      rebuildSongSelect();
      const sel = _q<HTMLSelectElement>('song-select');
      sel.addEventListener('change', () => {
        const id = Number(sel.value);
        selectedSong = allSongs.find(s => s.id === id) || null;
        renderSongInfo();
        recalculate();
        saveState();
      });
    }

    function renderSongInfo() {
      const info = _q('song-info');
      if (!selectedSong) {
        info.classList.add('hidden');
        _q('area-values-section').classList.add('hidden');
        return;
      }
      info.classList.remove('hidden');
      _q('song-type').textContent = selectedSong.song_type || '-';
      _q('song-name-val').textContent = selectedSong.song_name || '-';
      _q('song-artist').textContent = selectedSong.artist || '-';
      _q('song-notes').textContent = (selectedSong.notes_count || 0).toLocaleString();
      let sCount = 0, bCount = 0, mCount = 0;
      for (const gk of SONG_NOTE_GROUP_KEYS) {
        const g = selectedSong[gk];
        if (!g) continue;
        sCount += (g.shout_white || 0) + (g.shout_color || 0);
        bCount += (g.beat_white || 0) + (g.beat_color || 0);
        mCount += (g.melody_white || 0) + (g.melody_color || 0);
      }
      _q('song-attr-counts').innerHTML = `<span style="color:${ATTR_HEX.Shout}">🔴${sCount}</span> <span style="color:${ATTR_HEX.Beat}">🟢${bCount}</span> <span style="color:${ATTR_HEX.Melody}">🔵${mCount}</span>`;
      _q('song-duration-val').textContent = `${selectedSong.duration || '-'}秒`;

      const sr = selectedSong.shout_ratio || 0;
      const br = selectedSong.beat_ratio || 0;
      const mr = selectedSong.melody_ratio || 0;
      _q('song-chart').innerHTML = attrDonutSvg(sr, br, mr, { sizeClass: 'w-20 h-20' });
      _q('song-ratios').innerHTML = `
        <div style="color:${ATTR_HEX.Shout}">Shout: ${Math.round(sr * 100)}%</div>
        <div style="color:${ATTR_HEX.Beat}">Beat: ${Math.round(br * 100)}%</div>
        <div style="color:${ATTR_HEX.Melody}">Melody: ${Math.round(mr * 100)}%</div>
      `;

      const anchor = _q<HTMLAnchorElement>('song-detail-anchor');
      anchor.href = `${base}songs/${selectedSong.id}/`;
    }

    const DRAG_THRESHOLD = 6;
    const DRAG_DROP_HIGHLIGHT = ['ring-2', 'ring-indigo-400', 'ring-offset-1'];

    function clearDropHighlight() {
      rootEl.querySelectorAll<HTMLElement>('[data-slot-btn]').forEach(el => {
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
      const targetEl = rootEl.querySelector<HTMLElement>(`[data-slot-btn="${target}"]`);
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

    function attachSlotPointerHandlers() {
      rootEl.querySelectorAll<HTMLElement>('[data-slot-btn]').forEach(el => {
        const slot = Number(el.dataset.slotBtn);
        el.style.touchAction = 'none';
        el.addEventListener('pointerdown', (ev: PointerEvent) => {
          if (ev.button !== undefined && ev.button !== 0) return;
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
              openCardPicker(slot);
              return;
            }
            if (!dropped || !e) return;
            const target = findDropTargetSlot(e.clientX, e.clientY);
            if (target === null || target === slot || target === 5) return;
            swapSlots(deckState, slot, target);
            renderDeckSlots();
            renderCardDetailTable();
            recalculate();
            saveState();
          };

          const onUp = (e: PointerEvent) => finish(e, true);
          const onCancel = (e: PointerEvent) => finish(e, false);

          el.addEventListener('pointermove', onMove);
          el.addEventListener('pointerup', onUp);
          el.addEventListener('pointercancel', onCancel);
        });
      });
    }

    function renderDeckSlots() {
      const slotDummySong = selectedSong || { song_name: '' };
      const slotResolvedMap = resolveDeckBroachs(deckState.cards, allBroachs, slotDummySong);

      // 縮小スキルの並び順警告: 発動優先度 メンバー1(idx=1) → センター(idx=0) → メンバー2(idx=2)
      // の順に強い縮小スキルが配置されているかを検証
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
      const misplacedSlots = new Set<number>();
      if (hasAnyShrink) {
        for (let pi = 0; pi < PRIORITY_SLOTS.length; pi++) {
          if (shrinkStrengths[pi] !== sortedDesc[pi]) {
            misplacedSlots.add(PRIORITY_SLOTS[pi]);
          }
        }
      }

      for (let i = 0; i < 6; i++) {
        const card = deckState.cards[i];
        const container = rootEl.querySelector<HTMLElement>(`[data-slot-btn="${i}"]`);
        if (!container) continue;

        if (!card) {
          const isFriend = i === 5;
          container.className = `slot-content border-2 border-dashed ${isFriend ? 'border-amber-300 hover:border-amber-400 hover:bg-amber-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'} rounded-lg p-2 flex flex-col items-center justify-center min-h-[120px] cursor-pointer transition-colors`;
          container.innerHTML = `
            <svg class="w-8 h-8 ${isFriend ? 'text-amber-300' : 'text-gray-300'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span class="text-[10px] ${isFriend ? 'text-amber-400' : 'text-gray-400'} mt-1">選択</span>`;
          continue;
        }

        const attr = normalizeAttribute(card.attribute);
        const attrColor = ATTR_HEX[attr] || '#6b7280';
        const rarityClass = RARITY_BADGE_CLASSES[card.rarity || ''] || 'bg-gray-300';
        const attrBgClass = ATTR_BADGE_BG[attr] || 'bg-gray-300';

        const currentTier = deckState.bonusTiers[i];
        const trainedChecked = deckState.trained[i];
        const currentSkillLv = deckState.skillLevels[i];

        const cardBroachs = card.rarity === 'UR'
          ? allBroachs.filter(br => br.card_id === card.cardID)
          : [];
        const slotResolved = slotResolvedMap.get(i) ?? [];
        let broachLabelHtml = '';
        if (cardBroachs.length > 0) {
          broachLabelHtml = cardBroachs.map(br => {
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
              return `<div class="mt-1 w-full text-[8px] bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-1 py-0.5 text-gray-400 dark:text-slate-500 truncate text-center line-through" title="${label}（オート専用・計算対象外）">🔮 ${label}（オート専用）</div>`;
            } else if (isActive) {
              return `<div class="mt-1 w-full text-[8px] bg-purple-50 border border-purple-200 rounded px-1 py-0.5 text-purple-700 truncate text-center" title="${label}">🔮 ${label}</div>`;
            } else {
              return `<div class="mt-1 w-full text-[8px] bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-1 py-0.5 text-gray-400 dark:text-slate-500 truncate text-center" title="${label}（条件未達）">🔮 ${label}</div>`;
            }
          }).join('');
        }

        let sharedBroachHtml = '';
        if (card.rarity === 'UR') {
          const hasFixed = cardBroachs.length > 0;
          const maxShared = hasFixed ? 1 : 2;
          for (let s = 0; s < maxShared; s++) {
            const currentVal = deckState.sharedBroachs[i]?.[s] ?? 0;
            const options = SHARED_BROACHS.map(sb => {
              const sel = sb.id === currentVal ? ' selected' : '';
              const stats: string[] = [];
              if (sb.shout) stats.push(`S+${sb.shout}`);
              if (sb.beat) stats.push(`B+${sb.beat}`);
              if (sb.melody) stats.push(`M+${sb.melody}`);
              const cond = sb.targetAttribute ? `${sb.targetAttribute}属性` : '';
              const label = cond ? `${sb.name} (${cond} ${stats.join('/')})` : `${sb.name} (${stats.join('/')})`;
              return `<option value="${sb.id}"${sel}>${label}</option>`;
            }).join('');
            sharedBroachHtml += `
              <select class="shared-broach-select mt-1 w-full text-[8px] border border-purple-300 rounded px-0.5 py-0.5 bg-purple-50 text-purple-700 focus:outline-none focus:ring-1 focus:ring-purple-400"
                      data-broach-slot="${i}" data-broach-idx="${s}">
                <option value="0">共有ブローチ${maxShared > 1 ? (s + 1) : ''}を選択</option>
                ${options}
              </select>`;
          }
        }

        const shrinkWarningHtml = misplacedSlots.has(i)
          ? `<div class="mt-1 w-full text-[8px] bg-amber-50 border border-amber-300 rounded px-1 py-0.5 text-amber-700 text-center" title="縮小スキルの並び順が最適ではありません。発動優先度はメンバー1 → センター → メンバー2 の順なので、強い縮小スキル（倍率×発動率）ほど優先度の高いスロットに配置するとスコアが伸びやすくなります。">⚠️ 並び順</div>`
          : '';

        const cursorClass = i === 5 ? 'cursor-pointer' : 'cursor-grab';
        container.className = `slot-content border-2 border-solid rounded-lg p-1.5 flex flex-col items-center ${cursorClass} min-h-[120px] transition-colors`;
        container.style.borderColor = attrColor;
        container.innerHTML = `
          <img src="${cardThumbUrl(card.ID!)}" alt="${card.cardname || ''}" class="w-full max-w-[60px] h-auto rounded mb-1"
            onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 67%22><rect width=%2248%22 height=%2267%22 fill=%22%23e5e7eb%22/></svg>'" loading="lazy" />
          <div class="flex gap-0.5 mb-1">
            <span class="px-1 py-0.5 text-[9px] font-bold text-white rounded ${rarityClass}">${card.rarity || '?'}</span>
            <span class="px-1 py-0.5 text-[9px] font-bold text-white rounded ${attrBgClass}">${attr}</span>
          </div>
          <div class="text-[9px] text-gray-600 dark:text-slate-300 text-center truncate w-full" title="${card.cardname || ''}">${card.cardname || ''}</div>
          <div class="text-[8px] text-gray-400 dark:text-slate-500 text-center">${card.name || ''}</div>
          <label class="trained-label mt-1 flex items-center gap-1 text-[9px] text-gray-600 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" class="trained-check w-3 h-3" data-trained-slot="${i}"${trainedChecked ? ' checked' : ''} />
            <span>特訓済</span>
          </label>
          <select class="bonus-tier-select mt-1 w-full text-[9px] border border-gray-300 dark:border-slate-600 rounded px-0.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" data-bonus-slot="${i}">
            ${EVENT_BONUS_TIERS.map(t => `<option value="${t.key}"${currentTier === t.key ? ' selected' : ''}>${t.optionLabel}</option>`).join('')}
          </select>
          <select class="skill-level-select mt-1 w-full text-[9px] border border-gray-300 dark:border-slate-600 rounded px-0.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" data-skill-slot="${i}">
            ${[1, 2, 3, 4, 5].map(lv => `<option value="${lv}"${currentSkillLv === lv ? ' selected' : ''}>スキルLv${lv}</option>`).join('')}
          </select>${shrinkWarningHtml}${broachLabelHtml}${sharedBroachHtml}`;
      }

      rootEl.querySelectorAll('.bonus-tier-select').forEach(el => {
        el.addEventListener('click', (e) => e.stopPropagation());
        el.addEventListener('change', (e) => {
          const sel = e.target as HTMLSelectElement;
          const slot = Number(sel.dataset.bonusSlot);
          deckState.bonusTiers[slot] = sel.value as EventBonusTier;
          applyBonusTierStyle(sel);
          renderCardDetailTable();
          recalculate();
          saveState();
        });
        applyBonusTierStyle(el as HTMLSelectElement);
      });

      rootEl.querySelectorAll('.trained-label').forEach(el => {
        el.addEventListener('click', (e) => e.stopPropagation());
      });
      rootEl.querySelectorAll('.trained-check').forEach(el => {
        el.addEventListener('change', (e) => {
          const chk = e.target as HTMLInputElement;
          const slot = Number(chk.dataset.trainedSlot);
          deckState.trained[slot] = chk.checked;
          renderCardDetailTable();
          recalculate();
          saveState();
        });
      });

      rootEl.querySelectorAll('.skill-level-select').forEach(el => {
        el.addEventListener('click', (e) => e.stopPropagation());
        el.addEventListener('change', (e) => {
          const sel = e.target as HTMLSelectElement;
          const slot = Number(sel.dataset.skillSlot);
          deckState.skillLevels[slot] = Number(sel.value) as 1 | 2 | 3 | 4 | 5;
          renderDeckSlots();
          renderCardDetailTable();
          recalculate();
          saveState();
        });
      });

      rootEl.querySelectorAll('.shared-broach-select').forEach(el => {
        el.addEventListener('click', (e) => e.stopPropagation());
        el.addEventListener('change', (e) => {
          const sel = e.target as HTMLSelectElement;
          const slot = Number(sel.dataset.broachSlot);
          const idx = Number(sel.dataset.broachIdx);
          const val = Number(sel.value);
          if (!deckState.sharedBroachs[slot]) deckState.sharedBroachs[slot] = [];
          while (deckState.sharedBroachs[slot].length <= idx) deckState.sharedBroachs[slot].push(0);
          deckState.sharedBroachs[slot][idx] = val;
          renderDeckSlots();
          recalculate();
          saveState();
        });
      });

      renderCardDetailTable();
      updateCalcButton();
    }

    function applyBonusTierStyle(sel: HTMLSelectElement) {
      const tier = sel.value as EventBonusTier;
      sel.classList.remove(...ALL_SELECT_CLASSES);
      const def = EVENT_BONUS_TIERS.find(t => t.key === tier);
      if (def && def.selectClasses.length > 0) {
        sel.classList.add(...def.selectClasses);
      }
    }

    function renderCardDetailTable() {
      const filledCards = deckState.cards.filter(c => c !== null);
      if (filledCards.length === 0) {
        _q('card-detail-section').classList.add('hidden');
        return;
      }
      _q('card-detail-section').classList.remove('hidden');

      const dummySong = selectedSong || { song_name: '' };
      const resolvedMap = resolveDeckBroachs(deckState.cards, allBroachs, dummySong);

      const attrCounts: Record<string, number> = { Shout: 0, Beat: 0, Melody: 0 };
      for (const c of deckState.cards) {
        if (!c) continue;
        const a = normalizeAttribute(c.attribute);
        if (a in attrCounts) attrCounts[a]++;
      }

      const rnMap = loadRabbitNotes();
      let totalShout = 0, totalBeat = 0, totalMelody = 0;
      let totalBS = 0, totalBB = 0, totalBM = 0;
      const rows = DISPLAY_ORDER.map(i => {
        const card = deckState.cards[i];
        if (!card) return '';
        const slotBroachs = resolvedMap.get(i) ?? [];
        const activeBroachs = slotBroachs.filter(rb => rb.active && rb.broach.broach_type !== 9);
        let bS = activeBroachs.reduce((s, rb) => s + (rb.broach.shout || 0) * (rb.multiplier ?? 1), 0);
        let bB = activeBroachs.reduce((s, rb) => s + (rb.broach.beat || 0) * (rb.multiplier ?? 1), 0);
        let bM = activeBroachs.reduce((s, rb) => s + (rb.broach.melody || 0) * (rb.multiplier ?? 1), 0);
        if (card.rarity === 'UR') {
          for (const sbId of (deckState.sharedBroachs[i] || [])) {
            if (!sbId) continue;
            const sb = SHARED_BROACHS.find(s => s.id === sbId);
            if (!sb) continue;
            if (sb.targetAttribute) {
              const count = attrCounts[sb.targetAttribute] || 0;
              bS += sb.shout * count; bB += sb.beat * count; bM += sb.melody * count;
            } else {
              bS += sb.shout; bB += sb.beat; bM += sb.melody;
            }
          }
        }
        const skillType = card.ap_skill_type || '-';
        const sl = getApSkillLevel(card, deckState.skillLevels[i]);
        const skillEffect = formatSkillEffect(card.ap_skill_type, card.ap_skill_req, sl);
        const tier = deckState.bonusTiers[i];
        const bonusLabel = BONUS_LABEL[tier];
        const bonusClass = BONUS_CLASS[tier];
        const trained = deckState.trained[i];
        const trainedLabel = trained ? '済' : '未';
        const trainedClass = trained ? 'text-indigo-600 font-bold' : 'text-gray-400';
        const rn = rnMap[card.name || ''];
        const bonusMult = EVENT_BONUS_MULTIPLIER[tier];
        const cardAttr = normalizeAttribute(card.attribute);
        const trainBonus = TRAIN_BONUS[card.rarity ?? ''] ?? 0;
        const baseShout = (card.shout_max || 0) - (trained || cardAttr !== 'Shout' ? 0 : trainBonus);
        const baseBeat = (card.beat_max || 0) - (trained || cardAttr !== 'Beat' ? 0 : trainBonus);
        const baseMelody = (card.melody_max || 0) - (trained || cardAttr !== 'Melody' ? 0 : trainBonus);
        const statShout = Math.round((baseShout + (rn?.shout || 0)) * bonusMult);
        const statBeat = Math.round((baseBeat + (rn?.beat || 0)) * bonusMult);
        const statMelody = Math.round((baseMelody + (rn?.melody || 0)) * bonusMult);

        totalShout += statShout;
        totalBeat += statBeat;
        totalMelody += statMelody;
        totalBS += bS;
        totalBB += bB;
        totalBM += bM;

        return `<tr class="border-t">
          <td class="py-1 px-1 text-[10px] ${i === 0 ? 'text-indigo-600 font-bold' : i === 5 ? 'text-amber-600 font-bold' : 'text-gray-500'}">${SLOT_LABELS[i]}</td>
          <td class="py-1 px-1">
            <div>${card.cardname || ''}</div>
            <div class="text-[10px] text-gray-400 dark:text-slate-500">${card.name || ''}</div>
          </td>
          <td class="py-1 px-1 text-center ${trainedClass}">${trainedLabel}</td>
          <td class="py-1 px-1 text-center ${bonusClass}">${bonusLabel}</td>
          <td class="py-1 px-1 text-right ${ATTR_TEXT_CLASS.Shout}">${statShout.toLocaleString()}</td>
          <td class="py-1 px-1 text-right ${ATTR_TEXT_CLASS.Beat}">${statBeat.toLocaleString()}</td>
          <td class="py-1 px-1 text-right ${ATTR_TEXT_CLASS.Melody}">${statMelody.toLocaleString()}</td>
          <td class="py-1 px-1 text-right">${bS || '-'}</td>
          <td class="py-1 px-1 text-right">${bB || '-'}</td>
          <td class="py-1 px-1 text-right">${bM || '-'}</td>
          <td class="py-1 px-1">${skillType}</td>
          <td class="py-1 px-1">${skillEffect}</td>
        </tr>`;
      }).join('');

      _q('card-detail-body').innerHTML = rows;
      const centerCard = deckState.cards[0];
      const friendCard = deckState.cards[5];
      const centerRate = centerCard ? getCenterSkillRate(centerCard.rarity) : 0;
      const friendRate = friendCard ? getCenterSkillRate(friendCard.rarity) : 0;
      const centerAttr = centerCard ? normalizeAttribute(centerCard.attribute) : null;
      const friendAttr = friendCard ? normalizeAttribute(friendCard.attribute) : null;

      const baseShout = totalShout + totalBS;
      const baseBeat = totalBeat + totalBB;
      const baseMelody = totalMelody + totalBM;
      const centerShout = centerAttr === 'Shout' ? Math.floor(baseShout * centerRate / 100) : 0;
      const centerBeat = centerAttr === 'Beat' ? Math.floor(baseBeat * centerRate / 100) : 0;
      const centerMelody = centerAttr === 'Melody' ? Math.floor(baseMelody * centerRate / 100) : 0;
      const friendShout = friendAttr === 'Shout' ? Math.floor(baseShout * friendRate / 100) : 0;
      const friendBeat = friendAttr === 'Beat' ? Math.floor(baseBeat * friendRate / 100) : 0;
      const friendMelody = friendAttr === 'Melody' ? Math.floor(baseMelody * friendRate / 100) : 0;
      const csShout = centerShout + friendShout;
      const csBeat = centerBeat + friendBeat;
      const csMelody = centerMelody + friendMelody;

      const hasCenter = !!centerCard && centerRate > 0;
      const hasFriend = !!friendCard && friendRate > 0;

      const scoreUpAssistEnabled = _q<HTMLInputElement>('opt-scoreup-assist')?.checked ?? false;
      const teamShout = baseShout + csShout;
      const teamBeat = baseBeat + csBeat;
      const teamMelody = baseMelody + csMelody;
      const assistShout = scoreUpAssistEnabled ? Math.floor(teamShout * (1 + SCOREUP_ASSIST_RATE)) - teamShout : 0;
      const assistBeat = scoreUpAssistEnabled ? Math.floor(teamBeat * (1 + SCOREUP_ASSIST_RATE)) - teamBeat : 0;
      const assistMelody = scoreUpAssistEnabled ? Math.floor(teamMelody * (1 + SCOREUP_ASSIST_RATE)) - teamMelody : 0;
      const assistPct = Math.round(SCOREUP_ASSIST_RATE * 100);

      const deckShout  = teamShout  + assistShout;
      const deckBeat   = teamBeat   + assistBeat;
      const deckMelody = teamMelody + assistMelody;

      const noteShoutWhite  = Math.floor(deckShout  * NOTE_RATE.white);
      const noteBeatWhite   = Math.floor(deckBeat   * NOTE_RATE.white);
      const noteMelodyWhite = Math.floor(deckMelody * NOTE_RATE.white);
      const noteShoutColor  = Math.floor(deckShout  * NOTE_RATE.color);
      const noteBeatColor   = Math.floor(deckBeat   * NOTE_RATE.color);
      const noteMelodyColor = Math.floor(deckMelody * NOTE_RATE.color);

      _q('card-detail-foot').innerHTML = `<tr class="border-t-2 border-gray-300 dark:border-slate-600 font-bold text-xs">
        <td colspan="4" class="py-1 px-1 text-right text-gray-700 dark:text-slate-200">単純属性値計</td>
        <td class="py-1 px-1 text-right ${ATTR_TEXT_CLASS.Shout}">${totalShout.toLocaleString()}</td>
        <td class="py-1 px-1 text-right ${ATTR_TEXT_CLASS.Beat}">${totalBeat.toLocaleString()}</td>
        <td class="py-1 px-1 text-right ${ATTR_TEXT_CLASS.Melody}">${totalMelody.toLocaleString()}</td>
        <td class="py-1 px-1 text-right">${totalBS || '-'}</td>
        <td class="py-1 px-1 text-right">${totalBB || '-'}</td>
        <td class="py-1 px-1 text-right">${totalBM || '-'}</td>
        <td colspan="2"></td>
      </tr>${(totalBS + totalBB + totalBM) > 0 ? `<tr class="font-bold text-xs text-indigo-600">
        <td colspan="4" class="py-1 px-1 text-right">ブローチ</td>
        <td class="py-1 px-1 text-right">${totalBS > 0 ? `+${totalBS.toLocaleString()}` : '-'}</td>
        <td class="py-1 px-1 text-right">${totalBB > 0 ? `+${totalBB.toLocaleString()}` : '-'}</td>
        <td class="py-1 px-1 text-right">${totalBM > 0 ? `+${totalBM.toLocaleString()}` : '-'}</td>
        <td colspan="3"></td>
        <td colspan="2"></td>
      </tr>` : ''}${hasCenter ? `<tr class="font-bold text-xs text-purple-600">
        <td colspan="4" class="py-1 px-1 text-right">センターSkill (+${centerRate}%)</td>
        <td class="py-1 px-1 text-right">${centerShout > 0 ? `+${centerShout.toLocaleString()}` : '-'}</td>
        <td class="py-1 px-1 text-right">${centerBeat > 0 ? `+${centerBeat.toLocaleString()}` : '-'}</td>
        <td class="py-1 px-1 text-right">${centerMelody > 0 ? `+${centerMelody.toLocaleString()}` : '-'}</td>
        <td colspan="3"></td>
        <td colspan="2"></td>
      </tr>` : ''}${hasFriend ? `<tr class="font-bold text-xs text-purple-600">
        <td colspan="4" class="py-1 px-1 text-right">FセンターSkill (+${friendRate}%)</td>
        <td class="py-1 px-1 text-right">${friendShout > 0 ? `+${friendShout.toLocaleString()}` : '-'}</td>
        <td class="py-1 px-1 text-right">${friendBeat > 0 ? `+${friendBeat.toLocaleString()}` : '-'}</td>
        <td class="py-1 px-1 text-right">${friendMelody > 0 ? `+${friendMelody.toLocaleString()}` : '-'}</td>
        <td colspan="3"></td>
        <td colspan="2"></td>
      </tr>` : ''}${scoreUpAssistEnabled ? `<tr class="border-t-2 border-gray-300 dark:border-slate-600 font-bold text-xs text-emerald-600">
        <td colspan="4" class="py-1 px-1 text-right">ScoreUPアシスト (+${assistPct}%)</td>
        <td class="py-1 px-1 text-right">${assistShout > 0 ? `+${assistShout.toLocaleString()}` : '-'}</td>
        <td class="py-1 px-1 text-right">${assistBeat > 0 ? `+${assistBeat.toLocaleString()}` : '-'}</td>
        <td class="py-1 px-1 text-right">${assistMelody > 0 ? `+${assistMelody.toLocaleString()}` : '-'}</td>
        <td colspan="3"></td>
        <td colspan="2"></td>
      </tr>` : ''}<tr class="border-t-2 border-gray-300 dark:border-slate-600 font-bold text-xs">
        <td colspan="4" class="py-1 px-1 text-right text-gray-700 dark:text-slate-200">デッキ合計</td>
        <td class="py-1 px-1 text-right ${ATTR_TEXT_CLASS.Shout}">${deckShout.toLocaleString()}</td>
        <td class="py-1 px-1 text-right ${ATTR_TEXT_CLASS.Beat}">${deckBeat.toLocaleString()}</td>
        <td class="py-1 px-1 text-right ${ATTR_TEXT_CLASS.Melody}">${deckMelody.toLocaleString()}</td>
        <td colspan="3"></td>
        <td colspan="2"></td>
      </tr><tr class="text-xs text-gray-500 dark:text-slate-400">
        <td colspan="4" class="py-0.5 px-1 text-right">⚪🟢/1ノーツ</td>
        <td class="py-0.5 px-1 text-right ${ATTR_TEXT_CLASS.Shout}">${noteShoutWhite.toLocaleString()}</td>
        <td class="py-0.5 px-1 text-right ${ATTR_TEXT_CLASS.Beat}">${noteBeatWhite.toLocaleString()}</td>
        <td class="py-0.5 px-1 text-right ${ATTR_TEXT_CLASS.Melody}">${noteMelodyWhite.toLocaleString()}</td>
        <td colspan="3"></td>
        <td colspan="2"></td>
      </tr><tr class="text-xs text-gray-500 dark:text-slate-400">
        <td colspan="4" class="py-0.5 px-1 text-right">🔵🔴/1ノーツ</td>
        <td class="py-0.5 px-1 text-right ${ATTR_TEXT_CLASS.Shout}">${noteShoutColor.toLocaleString()}</td>
        <td class="py-0.5 px-1 text-right ${ATTR_TEXT_CLASS.Beat}">${noteBeatColor.toLocaleString()}</td>
        <td class="py-0.5 px-1 text-right ${ATTR_TEXT_CLASS.Melody}">${noteMelodyColor.toLocaleString()}</td>
        <td colspan="3"></td>
        <td colspan="2"></td>
      </tr>`;
    }

    function openCardPicker(slotIndex: number) {
      activeModalSlot = slotIndex;
      _q('modal-slot-label').textContent = SLOT_LABELS[slotIndex];

      const ownedCheckbox = _q<HTMLInputElement>('modal-owned-only');
      if (slotIndex === 5) {
        ownedCheckbox.checked = false;
      } else {
        ownedCheckbox.checked = true;
      }

      _q<HTMLInputElement>('modal-search').value = '';
      _q<HTMLSelectElement>('modal-rarity').value = '';
      _q<HTMLSelectElement>('modal-attribute').value = '';

      renderModalCards();
      _q('card-picker-modal').classList.remove('hidden');
      _q<HTMLInputElement>('modal-search').focus();
    }

    function closeCardPicker() {
      _q('card-picker-modal').classList.add('hidden');
      activeModalSlot = -1;
    }

    function renderModalCards() {
      const text = _q<HTMLInputElement>('modal-search').value.toLowerCase();
      const rarity = _q<HTMLSelectElement>('modal-rarity').value;
      const attribute = _q<HTMLSelectElement>('modal-attribute').value;
      const ownedOnly = _q<HTMLInputElement>('modal-owned-only').checked;
      const counts = loadCounts();

      let filtered = allCards.filter(card => {
        if (ownedOnly && !(counts[String(card.ID)] >= 1)) return false;
        if (!cardTextMatches(card, text)) return false;
        if (rarity && card.rarity !== rarity) return false;
        if (attribute && normalizeAttribute(card.attribute) !== attribute) return false;
        return true;
      });

      filtered.sort((a, b) => (b.ID || 0) - (a.ID || 0));

      _q('modal-result-count').textContent = `${filtered.length}件`;

      const html = filtered.slice(0, 200).map(card => {
        const attr = normalizeAttribute(card.attribute);
        const rarityClass = RARITY_BADGE_CLASSES[card.rarity || ''] || 'bg-gray-300';
        const attrBgClass = ATTR_BADGE_BG[attr] || 'bg-gray-300';
        const total = (card.shout_max || 0) + (card.beat_max || 0) + (card.melody_max || 0);

        return `<div class="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-slate-900 cursor-pointer border-b border-gray-100 dark:border-slate-800" data-pick-card="${card.ID}">
          <img src="${cardThumbUrl(card.ID!)}" alt="${card.cardname || ''}" class="w-10 h-auto rounded flex-shrink-0" loading="lazy" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1">
              <span class="px-1 py-0.5 text-[9px] font-bold text-white rounded ${rarityClass}">${card.rarity || '?'}</span>
              <span class="px-1 py-0.5 text-[9px] font-bold text-white rounded ${attrBgClass}">${attr}</span>
              <span class="text-xs font-medium truncate">${card.cardname || ''}</span>
            </div>
            <div class="text-[10px] text-gray-500 dark:text-slate-400">${card.name || ''} | 合計: ${total.toLocaleString()} | ${card.ap_skill_type || '-'}</div>
          </div>
        </div>`;
      }).join('');

      _q('modal-card-list').innerHTML = html || '<p class="text-sm text-gray-400 dark:text-slate-500 text-center py-8">該当する衣装がありません</p>';

      rootEl.querySelectorAll('[data-pick-card]').forEach(el => {
        el.addEventListener('click', () => {
          const cardId = Number((el as HTMLElement).dataset.pickCard);
          const card = allCards.find(c => c.ID === cardId);
          if (card && activeModalSlot >= 0) {
            setCard(deckState, activeModalSlot, card, defaultTierFor(card), allBroachs);
            closeCardPicker();
            renderDeckSlots();
            recalculate();
            saveState();
          }
        });
      });
    }

    function recalculate() {
      updateCalcButton();
      const filledCards = deckState.cards.filter(c => c !== null);
      if (!selectedSong || filledCards.length === 0) {
        _q('score-breakdown').classList.add('hidden');
        _q('area-values-section').classList.add('hidden');
        _q('mc-results').classList.add('hidden');
        _q('expected-score').classList.add('hidden');
        _q('skill-stats').classList.add('hidden');
        _q('shrink-coverage-row').classList.add('hidden');
        _q('shrink-expected-row').classList.add('hidden');
        _q('skill-per-card-section').classList.add('hidden');
        _q('final-result').textContent = '---';
        simulationResult = null;
        return;
      }

      const team = computeTeam(deckState.cards, allBroachs, selectedSong, deckState.bonusTiers, deckState.trained, undefined, deckState.sharedBroachs, deckState.skillLevels, loadRabbitNotes());
      const exclusion = computeShrinkExclusion(team, computeGroupSizes(selectedSong));
      const notes = flattenNotes(selectedSong, 42, exclusion);

      _q('score-breakdown').classList.remove('hidden');

      const scoreOptions: ScoreOptions = {
        scoreUpAssist: _q<HTMLInputElement>('opt-scoreup-assist').checked,
        scoreUpBadgeRate: parseFloat(_q<HTMLInputElement>('opt-scoreup-badge-rate').value) || 0,
      };

      const minScore = calcMinScore(team, notes, scoreOptions);
      const maxScore = calcMaxScore(team, notes, scoreOptions);
      _q('score-min').textContent = minScore.toLocaleString();
      _q('score-max').textContent = maxScore.toLocaleString();

      updateShrinkCoverage(team, selectedSong);

      renderSkillPerCard(team, notes, selectedSong.notes_count || 0, scoreOptions);

      renderAreaValues(team, selectedSong);

      _q('mc-results').classList.add('hidden');
      _q('expected-score').classList.add('hidden');
      _q('skill-stats').classList.add('hidden');
      _q('final-result').textContent = '---';
      simulationResult = null;

    }

    function renderSkillPerCard(team: ComputedTeam, notes: FlatNote[], notesCount: number, options: ScoreOptions) {
      const rows: string[] = [];
      let totalExp = 0;
      let totalMax = 0;
      let totalActivations = 0;
      for (const i of DISPLAY_ORDER) {
        const card = deckState.cards[i];
        if (!card) continue;
        const exp = calcCardSkillExpected(team, notes, notesCount, i, options);
        const max = calcCardSkillMax(team, notes, notesCount, i, options);
        const activations = calcCardSkillMaxActivations(team, notesCount, i);
        totalExp += exp;
        totalMax += max;
        totalActivations += activations;
        const slotCls = i === 0 ? 'text-indigo-600 font-bold' : i === 5 ? 'text-amber-600 font-bold' : 'text-gray-500';
        rows.push(`<tr class="border-t">
          <td class="py-1 px-1 text-[10px] ${slotCls}">${SLOT_LABELS[i]}</td>
          <td class="py-1 px-1">
            <div>${card.cardname || ''}</div>
            <div class="text-[10px] text-gray-400 dark:text-slate-500">${card.name || ''}</div>
          </td>
          <td class="py-1 px-1">${card.ap_skill_type || '-'}</td>
          <td class="py-1 px-1 text-right">${exp > 0 ? exp.toLocaleString() : '-'}</td>
          <td class="py-1 px-1 text-right">${activations > 0 ? activations.toLocaleString() : '-'}</td>
          <td class="py-1 px-1 text-right">${max > 0 ? max.toLocaleString() : '-'}</td>
        </tr>`);
      }
      if (rows.length === 0) {
        _q('skill-per-card-section').classList.add('hidden');
        return;
      }
      _q('skill-per-card-section').classList.remove('hidden');
      _q('skill-per-card-body').innerHTML = rows.join('');
      _q('skill-per-card-foot').innerHTML = `<tr class="border-t-2 border-gray-300 dark:border-slate-600 font-bold">
        <td colspan="3" class="py-1 px-1 text-right text-gray-700 dark:text-slate-200">合計</td>
        <td class="py-1 px-1 text-right">${totalExp.toLocaleString()}</td>
        <td class="py-1 px-1 text-right">${totalActivations.toLocaleString()}</td>
        <td class="py-1 px-1 text-right">${totalMax.toLocaleString()}</td>
      </tr>`;
    }

    function updateShrinkCoverage(team: ComputedTeam, song: Song) {
      const offset = Number(_q<HTMLInputElement>('shrink-offset-input').value) || 0;
      const exclusion = computeShrinkExclusion(team, computeGroupSizes(song));

      const noteEl = _q('shrink-exclusion-note');
      const countEl = _q('shrink-exclusion-count');
      if (exclusion.totalExcluded > 0) {
        countEl.textContent = String(exclusion.totalExcluded);
        noteEl.classList.remove('hidden');
      } else {
        noteEl.classList.add('hidden');
      }

      const shrinkCoverage = calcShrinkCoverage(team, song.notes_count || 0, offset, exclusion.totalExcluded);
      if (shrinkCoverage) {
        _q('shrink-coverage-row').classList.remove('hidden');
        _q('shrink-expected-row').classList.remove('hidden');
        _q('shrink-offset-row').classList.remove('hidden');
        const rawPct = (shrinkCoverage.rawCoverageRate * 100).toFixed(1);
        const rawText = `${rawPct}%（${shrinkCoverage.rawCoveredSeconds.toFixed(1)}秒 / ${shrinkCoverage.effectiveSeconds.toFixed(1)}秒）`;
        _q('shrink-coverage-val').textContent = shrinkCoverage.rawCoverageRate > 1.0
          ? `${rawText} ※100%超過分は計算対象外`
          : rawText;
        const rawExpPct = (shrinkCoverage.rawExpectedCoverageRate * 100).toFixed(1);
        const rawExpText = `${rawExpPct}%（${shrinkCoverage.rawExpectedCoveredSeconds.toFixed(1)}秒 / ${shrinkCoverage.effectiveSeconds.toFixed(1)}秒）`;
        const hasOverlapCorrection =
          Math.abs(shrinkCoverage.rawExpectedCoverageRate - shrinkCoverage.expectedCoverageRate) > 0.001;
        _q('shrink-expected-val').textContent = hasOverlapCorrection
          ? `${rawExpText} ※重複区間で確率合成により実効カバー率は低下`
          : rawExpText;
      } else {
        _q('shrink-coverage-row').classList.add('hidden');
        _q('shrink-expected-row').classList.add('hidden');
        _q('shrink-offset-row').classList.add('hidden');
      }
    }

    function renderAreaValues(team: ComputedTeam, song: Song) {
      _q('area-values-section').classList.remove('hidden');

      let sWhiteWeighted = 0, sColorWeighted = 0;
      let bWhiteWeighted = 0, bColorWeighted = 0;
      let mWhiteWeighted = 0, mColorWeighted = 0;

      for (const gk of SONG_NOTE_GROUP_KEYS) {
        const mult = LIGHT_MULTIPLIER[gk];
        const g = song[gk];
        if (!g) continue;
        sWhiteWeighted += (g.shout_white || 0) * mult;
        sColorWeighted += (g.shout_color || 0) * mult;
        bWhiteWeighted += (g.beat_white || 0) * mult;
        bColorWeighted += (g.beat_color || 0) * mult;
        mWhiteWeighted += (g.melody_white || 0) * mult;
        mColorWeighted += (g.melody_color || 0) * mult;
      }

      const sArea = { white: Math.floor(team.Shout * NOTE_RATE.white * sWhiteWeighted), color: Math.floor(team.Shout * NOTE_RATE.color * sColorWeighted) };
      const bArea = { white: Math.floor(team.Beat * NOTE_RATE.white * bWhiteWeighted), color: Math.floor(team.Beat * NOTE_RATE.color * bColorWeighted) };
      const mArea = { white: Math.floor(team.Melody * NOTE_RATE.white * mWhiteWeighted), color: Math.floor(team.Melody * NOTE_RATE.color * mColorWeighted) };

      _q('area-s-white').textContent = sArea.white.toLocaleString();
      _q('area-s-color').textContent = sArea.color.toLocaleString();
      _q('area-s-total').textContent = (sArea.white + sArea.color).toLocaleString();
      _q('area-b-white').textContent = bArea.white.toLocaleString();
      _q('area-b-color').textContent = bArea.color.toLocaleString();
      _q('area-b-total').textContent = (bArea.white + bArea.color).toLocaleString();
      _q('area-m-white').textContent = mArea.white.toLocaleString();
      _q('area-m-color').textContent = mArea.color.toLocaleString();
      _q('area-m-total').textContent = (mArea.white + mArea.color).toLocaleString();
    }

    async function runMC() {
      if (!selectedSong || deckState.cards.filter(c => c !== null).length === 0) return;

      const btn = _q<HTMLButtonElement>('btn-calculate');
      btn.disabled = true;
      btn.textContent = '計算中...';
      _q('progress-container').classList.remove('hidden');

      const team = computeTeam(deckState.cards, allBroachs, selectedSong, deckState.bonusTiers, deckState.trained, undefined, deckState.sharedBroachs, deckState.skillLevels, loadRabbitNotes());
      const exclusion = computeShrinkExclusion(team, computeGroupSizes(selectedSong));
      const notes = flattenNotes(selectedSong, 42, exclusion);

      const iterations = Math.max(1, Math.floor(Number(_q<HTMLInputElement>('mc-iterations-input').value) || MC_ITERATIONS));

      const scoreOptions: ScoreOptions = {
        scoreUpAssist: _q<HTMLInputElement>('opt-scoreup-assist').checked,
        scoreUpBadgeRate: parseFloat(_q<HTMLInputElement>('opt-scoreup-badge-rate').value) || 0,
        maxShrinkCoverage: _q<HTMLInputElement>('opt-max-shrink-coverage').checked,
        maxScoreUpCoverage: _q<HTMLInputElement>('opt-max-scoreup-coverage').checked,
      };

      const result = await runSimulation(team, notes, iterations, (pct) => {
        const percent = Math.round(pct * 100);
        _q<HTMLElement>('progress-bar').style.width = `${percent}%`;
        _q('progress-text').textContent = `計算中... ${percent}%`;
      }, undefined, scoreOptions);

      simulationResult = result;

      _q('final-result').textContent = result.mean.toLocaleString();

      _q('mc-results').classList.remove('hidden');
      _q('mc-min-bound').textContent = result.minScore.toLocaleString();
      _q('mc-min').textContent = result.mcMin.toLocaleString();
      _q('mc-mean').textContent = result.mean.toLocaleString();
      _q('mc-median').textContent = result.median.toLocaleString();
      _q('mc-max').textContent = result.mcMax.toLocaleString();
      _q('mc-max-bound').textContent = result.maxScore.toLocaleString();
      _q('mc-stddev').textContent = result.stddev.toLocaleString();
      _q('mc-p90').textContent = result.p90.toLocaleString();
      _q('mc-iterations').textContent = iterations.toLocaleString();

      _q('histogram-container').innerHTML = renderHistogramSvg(result.scores, result.minScore, result.maxScore, result.mean);

      let sharedMin = Infinity, sharedMax = -Infinity;
      for (const v of result.shrinkScores) {
        if (v < sharedMin) sharedMin = v;
        if (v > sharedMax) sharedMax = v;
      }
      for (const v of result.scoreUpScores) {
        if (v < sharedMin) sharedMin = v;
        if (v > sharedMax) sharedMax = v;
      }
      const renderContributionHistogram = (values: number[], containerId: string, label: string, color: string) => {
        if (values.length === 0) {
          _q(containerId).innerHTML = '<span class="text-gray-400 dark:text-slate-500 text-xs">データなし</span>';
          return;
        }
        let sum = 0;
        for (const v of values) sum += v;
        const mean = sum / values.length;
        _q(containerId).innerHTML = renderHistogramSvg(values, sharedMin, sharedMax, mean, { xAxisLabel: label, barColor: color });
      };
      renderContributionHistogram(result.shrinkScores, 'histogram-shrink', '縮小スキル寄与', '#10b981');
      renderContributionHistogram(result.scoreUpScores, 'histogram-scoreup', 'スコアアップ寄与', '#6366f1');

      const expected = calcExpectedScore(team, notes, selectedSong.notes_count || notes.length, scoreOptions);
      _q('expected-score').classList.remove('hidden');
      _q('exp-base').textContent = expected.baseScore.toLocaleString();
      _q('exp-scoreup').textContent = expected.scoreUpExpected.toLocaleString();
      _q('exp-shrink').textContent = expected.shrinkExpected.toLocaleString();
      _q('exp-liveend').textContent = expected.liveEndScore.toLocaleString();
      _q('exp-final').textContent = expected.finalScore.toLocaleString();

      if (result.cardStats.length > 0) {
        _q('skill-stats').classList.remove('hidden');
        _q('skill-stats-body').innerHTML = result.cardStats.map(cs => `
          <tr class="border-t">
            <td class="py-1">${cs.cardname}</td>
            <td class="py-1">${cs.skillType}</td>
            <td class="py-1 text-right">${cs.theoreticalRate}%</td>
            <td class="py-1 text-right">${cs.avgActivations.toFixed(1)}回</td>
            <td class="py-1 text-right">+${Math.round(cs.avgScoreContribution).toLocaleString()}</td>
          </tr>`).join('');
      }

      btn.disabled = false;
      btn.textContent = 'シミュレーション計算';
      _q('progress-container').classList.add('hidden');
    }

    function updateCalcButton() {
      const btn = _q<HTMLButtonElement>('btn-calculate');
      const reason = _q('calc-disabled-reason');
      const hasCards = deckState.cards.some(c => c !== null);

      if (!selectedSong && !hasCards) {
        btn.disabled = true;
        reason.textContent = '楽曲を選択し、衣装を1枚以上配置してください';
      } else if (!selectedSong) {
        btn.disabled = true;
        reason.textContent = '楽曲を選択してください';
      } else if (!hasCards) {
        btn.disabled = true;
        reason.textContent = '衣装を1枚以上配置してください';
      } else {
        btn.disabled = false;
        reason.textContent = '';
      }
    }

    function buildStateObject() {
      const badgeRateEl = rootEl.querySelector<HTMLInputElement>('#opt-scoreup-badge-rate');
      const badgeRate = badgeRateEl ? (parseFloat(badgeRateEl.value) || 0) : undefined;
      return {
        songId: selectedSong?.id ?? null,
        deckIds: deckState.cards.map(c => c?.ID ?? null),
        bonusTiers: [...deckState.bonusTiers],
        trained: [...deckState.trained],
        sharedBroachs: deckState.sharedBroachs.map(a => [...a]),
        skillLevels: [...deckState.skillLevels],
        badgeRate,
      };
    }

    function applyState(state: any) {
      if (state.songId != null) {
        const song = allSongs.find(s => s.id === state.songId);
        if (song) {
          selectedSong = song;
          _q<HTMLSelectElement>('song-select').value = String(song.id);
          renderSongInfo();
        }
      } else {
        selectedSong = null;
        _q<HTMLSelectElement>('song-select').value = '';
        renderSongInfo();
      }
      if (Array.isArray(state.bonusTiers)) {
        for (let i = 0; i < 6; i++) {
          deckState.bonusTiers[i] = state.bonusTiers[i] || 'none';
        }
      }
      if (Array.isArray(state.trained)) {
        for (let i = 0; i < 6; i++) {
          deckState.trained[i] = state.trained[i] !== false;
        }
      }
      if (Array.isArray(state.sharedBroachs)) {
        for (let i = 0; i < 6; i++) {
          deckState.sharedBroachs[i] = Array.isArray(state.sharedBroachs[i]) ? state.sharedBroachs[i] : [];
        }
      }
      if (Array.isArray(state.skillLevels)) {
        for (let i = 0; i < 6; i++) {
          const lv = state.skillLevels[i];
          deckState.skillLevels[i] = (lv >= 1 && lv <= 5) ? lv : 5;
        }
      }
      deckState.cards = [null, null, null, null, null, null];
      if (Array.isArray(state.deckIds)) {
        for (let i = 0; i < 6; i++) {
          const id = state.deckIds[i];
          if (id != null) {
            deckState.cards[i] = allCards.find(c => c.ID === id) || null;
          }
        }
      }
      for (let i = 0; i < 6; i++) {
        clampSharedBroachs(deckState, i, allBroachs);
      }
      if (typeof state.badgeRate === 'number') {
        const el = _q<HTMLInputElement>('opt-scoreup-badge-rate');
        if (el) el.value = String(state.badgeRate);
      }
      renderDeckSlots();
      recalculate();
    }

    function saveState() {
      saveJson(STORAGE_KEYS.SCORE_CALC_STATE, buildStateObject());
    }

    function restoreState() {
      const state = loadJson<ReturnType<typeof buildStateObject> | null>(STORAGE_KEYS.SCORE_CALC_STATE, null);
      if (state) applyState(state);
    }

    function tryRestoreFromUrl(): boolean {
      if (typeof window === 'undefined') return false;
      const search = window.location.search;
      if (!search) return false;
      const params = new URLSearchParams(search);
      if (!params.has('dv')) return false;
      const decoded = decodeParamsToDeck(params);
      if (!decoded) return false;
      applyState(decoded);
      saveState();
      window.history.replaceState(null, '', window.location.pathname);
      return true;
    }

    async function shareDeckUrl() {
      const state = buildStateObject();
      if (isDeckEmpty(state)) {
        alert('編成が空です。楽曲や衣装を選んでから共有してください。');
        return;
      }
      const params = encodeDeckToParams(state);
      const url = `${window.location.origin}${base}score-calc/?${params.toString()}`;
      const btn = _q<HTMLButtonElement>('btn-share-url');
      const originalLabel = btn.textContent;
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          copied = true;
        }
      } catch {
        copied = false;
      }
      if (copied) {
        btn.textContent = '✅ コピーしました';
        btn.disabled = true;
        setTimeout(() => {
          btn.textContent = originalLabel;
          btn.disabled = false;
        }, 2000);
      } else {
        window.prompt('URL を選択してコピーしてください', url);
      }
    }

    type SavedDeck = {
      id: string;
      name: string;
      createdAt: number;
      updatedAt: number;
      state: ReturnType<typeof buildStateObject>;
    };

    function loadSavedDecks(): SavedDeck[] {
      return loadJson<SavedDeck[]>(STORAGE_KEYS.SAVED_DECKS, []);
    }

    function writeSavedDecks(decks: SavedDeck[]) {
      saveJson(STORAGE_KEYS.SAVED_DECKS, decks);
    }

    function saveDeck() {
      const hasCards = deckState.cards.some(c => c !== null);
      if (!hasCards) { alert('デッキに衣装を1枚以上セットしてください'); return; }

      const existing = loadSavedDecks();
      const defaultName = `デッキ ${existing.length + 1}`;
      const name = prompt('デッキ名を入力してください', defaultName);
      if (!name) return;

      const now = Date.now();
      const newDeck: SavedDeck = {
        id: now.toString(36),
        name: name.trim() || defaultName,
        createdAt: now,
        updatedAt: now,
        state: buildStateObject(),
      };
      existing.push(newDeck);
      writeSavedDecks(existing);

      const btn = _q('btn-save-deck');
      const orig = btn.textContent;
      btn.textContent = '保存しました';
      btn.classList.add('bg-green-100', 'text-green-700');
      btn.classList.remove('bg-indigo-100', 'text-indigo-700');
      setTimeout(() => {
        btn.textContent = orig;
        btn.classList.remove('bg-green-100', 'text-green-700');
        btn.classList.add('bg-indigo-100', 'text-indigo-700');
      }, 1500);
    }

    function showLoadDropdown() {
      const dropdown = _q('load-deck-dropdown');
      const isVisible = !dropdown.classList.contains('hidden');
      if (isVisible) { hideLoadDropdown(); return; }

      const decks = loadSavedDecks();
      if (decks.length === 0) {
        dropdown.innerHTML = '<div class="p-3 text-xs text-gray-400 dark:text-slate-500 text-center">保存されたデッキがありません</div>';
      } else {
        const items = decks.slice().reverse().map(d => {
          const date = new Date(d.updatedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          const cardCount = (d.state.deckIds || []).filter((id: number | null) => id != null).length;
          return `<div class="load-deck-item flex items-center justify-between px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 dark:border-slate-800 last:border-0" data-deck-id="${d.id}">
            <div class="min-w-0 flex-1">
              <div class="text-xs font-medium text-gray-700 dark:text-slate-200 truncate">${d.name}</div>
              <div class="text-[10px] text-gray-400 dark:text-slate-500">${date} / ${cardCount}枚</div>
            </div>
          </div>`;
        }).join('');
        dropdown.innerHTML = items + `<a href="${base}decks/" class="block text-center text-[10px] text-indigo-500 hover:text-indigo-700 py-2 border-t border-gray-100 dark:border-slate-800">デッキ管理ページ →</a>`;
      }

      dropdown.classList.remove('hidden');

      dropdown.querySelectorAll('.load-deck-item').forEach(el => {
        el.addEventListener('click', () => {
          const deckId = (el as HTMLElement).dataset.deckId!;
          loadDeck(deckId);
        });
      });
    }

    function hideLoadDropdown() {
      _q('load-deck-dropdown').classList.add('hidden');
    }

    function loadDeck(deckId: string) {
      const decks = loadSavedDecks();
      const target = decks.find(d => d.id === deckId);
      if (!target) return;
      applyState(target.state);
      saveState();
      hideLoadDropdown();
    }

    function initResultTabs() {
      const buttons = rootEl.querySelectorAll<HTMLButtonElement>('[data-tab]');
      const panels = rootEl.querySelectorAll<HTMLElement>('[data-tab-panel]');
      const activate = (key: string) => {
        panels.forEach(p => p.classList.toggle('hidden', p.id !== `tab-panel-${key}`));
        buttons.forEach(b => {
          const isActive = b.dataset.tab === key;
          b.classList.toggle('border-indigo-500', isActive);
          b.classList.toggle('text-indigo-700', isActive);
          b.classList.toggle('bg-indigo-50', isActive);
          b.classList.toggle('border-transparent', !isActive);
          b.classList.toggle('text-gray-500', !isActive);
        });
      };
      buttons.forEach(b => b.addEventListener('click', () => activate(b.dataset.tab!)));
      activate('expected');
    }

    const mutationObservers: MutationObserver[] = [];
    function initResultPlaceholders() {
      const pairs: Array<[string, string]> = [
        ['score-breakdown', 'breakdown-placeholder'],
        ['mc-results', 'mc-placeholder'],
        ['expected-score', 'expected-placeholder'],
        ['skill-stats', 'skills-placeholder'],
        ['area-values-section', 'area-placeholder'],
      ];
      const sync = (sectionId: string, placeholderId: string) => {
        const s = rootEl.querySelector(`#${sectionId}`);
        const p = rootEl.querySelector(`#${placeholderId}`);
        if (s && p) p.classList.toggle('hidden', !s.classList.contains('hidden'));
      };
      for (const [sec, ph] of pairs) {
        sync(sec, ph);
        const s = rootEl.querySelector(`#${sec}`);
        if (!s) continue;
        const mo = new MutationObserver(() => sync(sec, ph));
        mo.observe(s, {
          attributes: true,
          attributeFilter: ['class'],
        });
        mutationObservers.push(mo);
      }
    }

    // body-level dropdown-close handler (documented)
    const bodyClickHandler = (e: MouseEvent) => {
      const dropdown = rootEl.querySelector<HTMLElement>('#load-deck-dropdown');
      if (!dropdown) return;
      if (!dropdown.classList.contains('hidden') &&
          !(e.target as HTMLElement).closest('#load-deck-dropdown') &&
          !(e.target as HTMLElement).closest('#btn-load-deck')) {
        hideLoadDropdown();
      }
    };

    initResultTabs();
    initResultPlaceholders();
    initSongSelect();

    attachSlotPointerHandlers();

    _q('modal-backdrop').addEventListener('click', closeCardPicker);
    _q('modal-close').addEventListener('click', closeCardPicker);
    _q('modal-close-x').addEventListener('click', closeCardPicker);
    _q('modal-clear').addEventListener('click', () => {
      if (activeModalSlot >= 0) {
        clearSlot(deckState, activeModalSlot);
        closeCardPicker();
        renderDeckSlots();
        recalculate();
        saveState();
      }
    });

    let modalDebounce: ReturnType<typeof setTimeout>;
    _q('modal-search').addEventListener('input', () => {
      clearTimeout(modalDebounce);
      modalDebounce = setTimeout(renderModalCards, 200);
    });
    for (const id of ['modal-rarity', 'modal-attribute']) {
      _q(id).addEventListener('change', renderModalCards);
    }
    _q('modal-owned-only').addEventListener('change', renderModalCards);

    _q('btn-save-deck').addEventListener('click', saveDeck);
    _q('btn-load-deck').addEventListener('click', showLoadDropdown);
    _q('btn-share-url').addEventListener('click', shareDeckUrl);
    document.addEventListener('click', bodyClickHandler);

    _q('btn-calculate').addEventListener('click', runMC);

    _q('opt-scoreup-assist').addEventListener('change', () => {
      recalculate();
      renderCardDetailTable();
    });
    _q('opt-scoreup-badge-rate').addEventListener('input', () => { recalculate(); saveState(); });

    _q('shrink-offset-input').addEventListener('input', () => {
      if (!selectedSong || deckState.cards.filter(c => c !== null).length === 0) return;
      const team = computeTeam(deckState.cards, allBroachs, selectedSong, deckState.bonusTiers, deckState.trained, undefined, deckState.sharedBroachs, deckState.skillLevels, loadRabbitNotes());
      updateShrinkCoverage(team, selectedSong);
    });

    if (!tryRestoreFromUrl()) {
      restoreState();
    }
    updateCalcButton();

    refreshData('cards', fetchCardsJson, (fresh) => {
      allCards = fresh as Card[];
      deckState.cards = deckState.cards.map(c => c ? allCards.find(fc => fc.ID === c.ID) || null : null);
      renderDeckSlots();
      recalculate();
    });

    refreshData('songs', async () => filterAllowedSongs(filterValidSongs(await fetchSongsJson())), (fresh) => {
      allSongs = fresh as Song[];
      if (selectedSong) {
        selectedSong = allSongs.find(s => s.id === selectedSong!.id) || null;
      }
      rebuildSongSelect();
      if (selectedSong) {
        _q<HTMLSelectElement>('song-select').value = String(selectedSong.id);
      }
      renderSongInfo();
      recalculate();
    });

    refreshData('broachs', fetchFixedBroachsJson, (fresh) => {
      allBroachs = fresh as FixedBroach[];
      renderCardDetailTable();
      recalculate();
    });

    return () => {
      document.removeEventListener('click', bodyClickHandler);
      for (const mo of mutationObservers) mo.disconnect();
    };
  });
</script>

<div bind:this={rootEl}>
  <!-- 楽曲サマリーバー（全幅・横長） -->
  <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
    <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
      <div class="min-w-0">
        <label for="song-select" class="block text-xs font-bold text-gray-700 dark:text-slate-200 mb-2">🎵 楽曲</label>
        <select id="song-select" class="w-full border border-gray-300 dark:border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="">楽曲を選択</option>
        </select>
        <div id="song-info" class="mt-3 hidden">
          <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <div><dt class="text-gray-500 dark:text-slate-400 text-[10px]">曲名</dt><dd id="song-name-val" class="font-medium truncate"></dd></div>
            <div><dt class="text-gray-500 dark:text-slate-400 text-[10px]">アーティスト</dt><dd id="song-artist" class="font-medium truncate"></dd></div>
            <div><dt class="text-gray-500 dark:text-slate-400 text-[10px]">楽曲種類</dt><dd id="song-type" class="font-medium"></dd></div>
            <div><dt class="text-gray-500 dark:text-slate-400 text-[10px]">ノーツ数</dt><dd id="song-notes" class="font-medium"></dd></div>
            <div><dt class="text-gray-500 dark:text-slate-400 text-[10px]">秒数</dt><dd id="song-duration-val" class="font-medium"></dd></div>
            <div><dt class="text-gray-500 dark:text-slate-400 text-[10px]">構成</dt><dd id="song-attr-counts"></dd></div>
          </dl>
          <div class="mt-2 text-right">
            <a id="song-detail-anchor" href="#" class="text-xs text-indigo-600 hover:underline">楽曲詳細を見る →</a>
          </div>
        </div>
      </div>
      <div id="song-info-chart" class="flex items-center gap-3 md:border-l md:border-gray-200 md:pl-4 md:min-w-[180px]">
        <div id="song-chart" class="flex-shrink-0"></div>
        <div id="song-ratios" class="text-[11px] space-y-0.5"></div>
      </div>
    </div>
  </section>

  <!-- スキルオプション（折りたたみ可、デフォルト開） -->
  <details class="bg-white dark:bg-slate-800 rounded-lg shadow mb-4 group" open>
    <summary class="p-4 cursor-pointer font-bold text-sm text-gray-700 dark:text-slate-200 flex items-center justify-between select-none">
      <span>⚙️ スキルオプション</span>
      <svg class="w-4 h-4 text-gray-400 dark:text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
    </summary>
    <div class="px-4 pb-4 border-t border-gray-100 dark:border-slate-800 pt-3">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <label class="flex items-center gap-2">
          <input type="checkbox" id="opt-scoreup-assist" class="rounded" />
          <span>SCOREUPアシスト（属性値 ×1.2）</span>
        </label>
        <label class="flex items-center gap-2">
          <span class="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">SCOREUPバッジ倍率</span>
          <input type="number" id="opt-scoreup-badge-rate" class="w-20 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm" min="0" max="100" step="1" value="16" />
          <span class="text-xs text-gray-500 dark:text-slate-400">%</span>
        </label>
      </div>
      <p class="text-[11px] text-gray-400 dark:text-slate-500 mt-2">バッジ倍率: 0 で未装着、例: 15 → ×1.15</p>
    </div>
  </details>

  <div class="space-y-4">
    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200">🎴 デッキ編成</h2>
        <div class="relative flex gap-2">
          <button id="btn-save-deck" type="button" class="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition-colors">保存</button>
          <button id="btn-load-deck" type="button" class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">読込</button>
          <button id="btn-share-url" type="button" class="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors" aria-label="編成シェア URL をコピー">🔗 URLコピー</button>
          <div id="load-deck-dropdown" class="hidden absolute right-0 top-full mt-1 w-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"></div>
        </div>
      </div>
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-2" id="deck-slots">
        <div class="deck-slot" data-slot="1">
          <div class="text-[10px] text-center text-gray-500 dark:text-slate-400 mb-1">メンバー1</div>
          <div class="slot-content border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-2 flex flex-col items-center justify-center min-h-[120px] cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors" data-slot-btn="1">
            <svg class="w-8 h-8 text-gray-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span class="text-[10px] text-gray-400 dark:text-slate-500 mt-1">選択</span>
          </div>
        </div>
        <div class="deck-slot" data-slot="2">
          <div class="text-[10px] text-center text-gray-500 dark:text-slate-400 mb-1">メンバー2</div>
          <div class="slot-content border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-2 flex flex-col items-center justify-center min-h-[120px] cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors" data-slot-btn="2">
            <svg class="w-8 h-8 text-gray-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span class="text-[10px] text-gray-400 dark:text-slate-500 mt-1">選択</span>
          </div>
        </div>
        <div class="deck-slot" data-slot="0">
          <div class="text-[10px] text-center text-indigo-600 font-bold mb-1">センター</div>
          <div class="slot-content border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-2 flex flex-col items-center justify-center min-h-[120px] cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors" data-slot-btn="0">
            <svg class="w-8 h-8 text-gray-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span class="text-[10px] text-gray-400 dark:text-slate-500 mt-1">選択</span>
          </div>
        </div>
        <div class="deck-slot" data-slot="3">
          <div class="text-[10px] text-center text-gray-500 dark:text-slate-400 mb-1">メンバー3</div>
          <div class="slot-content border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-2 flex flex-col items-center justify-center min-h-[120px] cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors" data-slot-btn="3">
            <svg class="w-8 h-8 text-gray-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span class="text-[10px] text-gray-400 dark:text-slate-500 mt-1">選択</span>
          </div>
        </div>
        <div class="deck-slot" data-slot="4">
          <div class="text-[10px] text-center text-gray-500 dark:text-slate-400 mb-1">メンバー4</div>
          <div class="slot-content border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-2 flex flex-col items-center justify-center min-h-[120px] cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors" data-slot-btn="4">
            <svg class="w-8 h-8 text-gray-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span class="text-[10px] text-gray-400 dark:text-slate-500 mt-1">選択</span>
          </div>
        </div>
        <div class="deck-slot" data-slot="5">
          <div class="text-[10px] text-center text-amber-600 font-bold mb-1">フレンド</div>
          <div class="slot-content border-2 border-dashed border-amber-300 rounded-lg p-2 flex flex-col items-center justify-center min-h-[120px] cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-colors" data-slot-btn="5">
            <svg class="w-8 h-8 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span class="text-[10px] text-amber-400 mt-1">選択</span>
          </div>
        </div>
      </div>
    </section>

    <details id="card-detail-section" class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 hidden group" open>
      <summary class="cursor-pointer text-sm font-bold text-gray-700 dark:text-slate-200 flex items-center justify-between select-none mb-3">
        <span>🧾 衣装詳細</span>
        <svg class="w-4 h-4 text-gray-400 dark:text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </summary>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-gray-500 dark:text-slate-400 border-b">
              <th class="text-left py-1 px-1">スロット</th>
              <th class="text-left py-1 px-1">衣装名</th>
              <th class="text-center py-1 px-1">特訓</th>
              <th class="text-center py-1 px-1">特効</th>
              <th class="text-right py-1 px-1 text-red-500">Shout</th>
              <th class="text-right py-1 px-1 text-green-500">Beat</th>
              <th class="text-right py-1 px-1 text-blue-500">Melody</th>
              <th class="text-right py-1 px-1">ブローチS</th>
              <th class="text-right py-1 px-1">ブローチB</th>
              <th class="text-right py-1 px-1">ブローチM</th>
              <th class="text-left py-1 px-1">スキル</th>
              <th class="text-left py-1 px-1">効果</th>
            </tr>
          </thead>
          <tbody id="card-detail-body"></tbody>
          <tfoot id="card-detail-foot"></tfoot>
        </table>
      </div>
      <p class="text-xs text-gray-400 dark:text-slate-500 mt-2">※ オート専用ブローチはスコア計算の対象外です</p>
    </details>

    <details id="breakdown-section" class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 group" open>
      <summary class="cursor-pointer text-sm font-bold text-gray-700 dark:text-slate-200 flex items-center justify-between select-none mb-3">
        <span>📊 スキル詳細</span>
        <svg class="w-4 h-4 text-gray-400 dark:text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </summary>
      <section id="score-breakdown" class="hidden">
        <div class="space-y-1">
          <div id="shrink-coverage-row" class="flex justify-between text-sm hidden">
            <span class="text-gray-500 dark:text-slate-400">縮小カバー率（最大発動時）</span>
            <span id="shrink-coverage-val" class="font-medium text-orange-600"></span>
          </div>
          <div id="shrink-expected-row" class="flex justify-between text-sm hidden">
            <span class="text-gray-500 dark:text-slate-400">縮小カバー率（期待値）</span>
            <span id="shrink-expected-val" class="font-medium text-orange-600"></span>
          </div>
        </div>
        <p id="shrink-exclusion-note" class="text-xs text-gray-400 dark:text-slate-500 mt-2 hidden">※ 最初の<span id="shrink-exclusion-count" class="font-medium">0</span>ノーツは縮小の計算対象外です</p>
        <div id="shrink-offset-row" class="flex items-center justify-end gap-1 mt-2 text-xs text-gray-500 dark:text-slate-400 hidden">
          <label for="shrink-offset-input">先頭</label>
          <input type="number" id="shrink-offset-input" value="0" min="0" step="1" class="w-12 border border-gray-300 dark:border-slate-600 rounded px-1 py-0.5 text-right" />
          <span>秒除外</span>
        </div>
        <div id="skill-per-card-section" class="mt-4 border-t pt-3 hidden">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-gray-500 dark:text-slate-400 border-b">
                <th class="text-left py-1 px-1">スロット</th>
                <th class="text-left py-1 px-1">衣装名</th>
                <th class="text-left py-1 px-1">スキル</th>
                <th class="text-right py-1 px-1">スキル期待値</th>
                <th class="text-right py-1 px-1">スキル最大発動回数</th>
                <th class="text-right py-1 px-1">スキル論理最高値</th>
              </tr>
            </thead>
            <tbody id="skill-per-card-body"></tbody>
            <tfoot id="skill-per-card-foot"></tfoot>
          </table>
          <p class="text-xs text-gray-400 dark:text-slate-500 mt-2">※ 複数の判定縮小スキルが共存する場合、値は按分されます</p>
        </div>
      </section>
      <p id="breakdown-placeholder" class="text-xs text-gray-400 dark:text-slate-500 text-center py-6">楽曲と衣装を設定するとスキル詳細が表示されます</p>
    </details>

    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
      <div class="grid grid-cols-2 gap-4 text-center">
        <div>
          <div class="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-widest">理論最低</div>
          <div id="score-min" class="text-base md:text-lg font-bold text-gray-700 dark:text-slate-200 mt-1">-</div>
        </div>
        <div>
          <div class="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-widest">理論最高</div>
          <div id="score-max" class="text-base md:text-lg font-bold text-gray-700 dark:text-slate-200 mt-1">-</div>
        </div>
      </div>
    </section>

    <div class="space-y-2">
      <div class="flex items-center justify-end gap-2 flex-wrap">
        <label for="mc-iterations-input" class="text-xs text-gray-500 dark:text-slate-400">シミュレーション回数</label>
        <input
          id="mc-iterations-input"
          type="number"
          min="1"
          step="1"
          class="w-28 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={MC_ITERATIONS}
        />
        <span class="text-xs text-gray-500 dark:text-slate-400">回</span>
        <label class="flex items-center gap-1 text-xs text-gray-600 dark:text-slate-300 cursor-pointer select-none" title="ON にすると縮小スキルの確率判定を常に成功扱いにし、縮小カバー率が最大値となる前提で MC シミュレーションを実行します">
          <input type="checkbox" id="opt-max-shrink-coverage" class="rounded" />
          <span>縮小全発動</span>
        </label>
        <label class="flex items-center gap-1 text-xs text-gray-600 dark:text-slate-300 cursor-pointer select-none" title="ON にするとスコアアップスキル（タイマー型含む）の確率判定を常に成功扱いにし、スコアアップが理論最大発動回数となる前提で MC シミュレーションを実行します">
          <input type="checkbox" id="opt-max-scoreup-coverage" class="rounded" />
          <span>スコアアップ全発動</span>
        </label>
      </div>
      <button id="btn-calculate" type="button" class="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
        🧮 シミュレーション計算
      </button>
      <p id="calc-disabled-reason" class="text-xs text-center text-amber-600"></p>
      <div id="progress-container" class="hidden">
        <div class="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
          <div id="progress-bar" class="bg-indigo-600 h-2 rounded-full transition-all" style="width: 0%"></div>
        </div>
        <p id="progress-text" class="text-xs text-gray-500 dark:text-slate-400 mt-1 text-center">計算中...</p>
      </div>
    </div>

    <section class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg shadow p-4 md:p-6">
      <div class="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-widest text-center">平均スコア</div>
      <div id="final-result" class="text-3xl md:text-5xl font-bold text-indigo-700 text-center mt-1">---</div>
      <div class="mt-3 text-center">
        <span class="text-[10px] text-gray-500 dark:text-slate-400">試行回数: </span>
        <span id="mc-iterations" class="text-xs md:text-sm font-bold text-gray-700 dark:text-slate-200">-</span>
      </div>
    </section>

    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
      <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-3">🎲 シミュレーション統計</h2>
      <section id="mc-results" class="hidden">
        <table class="w-full text-sm">
          <tbody>
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">期待最低値</td><td id="mc-min-bound" class="text-right py-1"></td></tr>
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">最小</td><td id="mc-min" class="text-right py-1"></td></tr>
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">平均</td><td id="mc-mean" class="text-right py-1 font-bold"></td></tr>
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">中央値</td><td id="mc-median" class="text-right py-1"></td></tr>
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">最大</td><td id="mc-max" class="text-right py-1"></td></tr>
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">期待最高値</td><td id="mc-max-bound" class="text-right py-1"></td></tr>
            <tr class="border-t"><td class="text-gray-500 dark:text-slate-400 py-1">標準偏差</td><td id="mc-stddev" class="text-right py-1"></td></tr>
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">90パーセンタイル</td><td id="mc-p90" class="text-right py-1"></td></tr>
          </tbody>
        </table>
        <div id="histogram-container" class="mt-4"></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <div class="text-xs text-gray-600 dark:text-slate-300 mb-1">縮小スキル寄与量の分布</div>
            <div id="histogram-shrink"></div>
          </div>
          <div>
            <div class="text-xs text-gray-600 dark:text-slate-300 mb-1">スコアアップスキル寄与量の分布</div>
            <div id="histogram-scoreup"></div>
          </div>
        </div>
      </section>
      <p id="mc-placeholder" class="text-xs text-gray-400 dark:text-slate-500 text-center py-6">計算を実行するとシミュレーション結果が表示されます</p>
    </section>

    <div class="bg-white dark:bg-slate-800 rounded-lg shadow">
      <div class="flex border-b overflow-x-auto" role="tablist" aria-label="結果タブ">
        <button type="button" data-tab="expected" class="result-tab px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 border-transparent text-gray-500 dark:text-slate-400 hover:text-indigo-600 transition-colors">📈 期待値</button>
        <button type="button" data-tab="skills" class="result-tab px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 border-transparent text-gray-500 dark:text-slate-400 hover:text-indigo-600 transition-colors">⚡ スキル発動</button>
        <button type="button" data-tab="area" class="result-tab px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 border-transparent text-gray-500 dark:text-slate-400 hover:text-indigo-600 transition-colors">🎵 面積値</button>
      </div>

      <div id="tab-panel-expected" data-tab-panel class="p-4 hidden">
        <section id="expected-score" class="hidden">
          <p class="text-[11px] text-gray-500 dark:text-slate-400 mb-3">外部サイト準拠の単純期待値（シミュレーションの確率的揺れを含まない決定論的な値）</p>
          <table class="w-full text-sm">
            <tbody>
              <tr><td class="text-gray-500 dark:text-slate-400 py-1">属性値による楽曲スコア</td><td id="exp-base" class="text-right py-1"></td></tr>
              <tr><td class="text-gray-500 dark:text-slate-400 py-1">スコアアップ期待値</td><td id="exp-scoreup" class="text-right py-1"></td></tr>
              <tr><td class="text-gray-500 dark:text-slate-400 py-1">判定縮小期待値</td><td id="exp-shrink" class="text-right py-1"></td></tr>
              <tr class="border-t"><td class="text-gray-500 dark:text-slate-400 py-1">ライブ終了時スコア</td><td id="exp-liveend" class="text-right py-1"></td></tr>
              <tr><td class="text-gray-500 dark:text-slate-400 py-1 font-bold">最終リザルト</td><td id="exp-final" class="text-right py-1 font-bold"></td></tr>
            </tbody>
          </table>
        </section>
        <p id="expected-placeholder" class="text-xs text-gray-400 dark:text-slate-500 text-center py-6">計算を実行すると算術期待値が表示されます</p>
      </div>

      <div id="tab-panel-skills" data-tab-panel class="p-4 hidden">
        <section id="skill-stats" class="hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-gray-500 dark:text-slate-400 border-b">
                  <th class="text-left py-1">衣装名</th>
                  <th class="text-left py-1">スキル</th>
                  <th class="text-right py-1">発動率</th>
                  <th class="text-right py-1">平均発動</th>
                  <th class="text-right py-1">スコア寄与</th>
                </tr>
              </thead>
              <tbody id="skill-stats-body"></tbody>
            </table>
          </div>
        </section>
        <p id="skills-placeholder" class="text-xs text-gray-400 dark:text-slate-500 text-center py-6">計算を実行するとスキル発動統計が表示されます</p>
      </div>

      <div id="tab-panel-area" data-tab-panel class="p-4 hidden">
        <section id="area-values-section" class="hidden">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-gray-500 dark:text-slate-400">
                <th class="text-left py-1">属性</th>
                <th class="text-right py-1">白ノート</th>
                <th class="text-right py-1">色ノート</th>
                <th class="text-right py-1">合計</th>
              </tr>
            </thead>
            <tbody>
              <tr><td class="py-1 text-red-500 font-medium">Shout</td><td id="area-s-white" class="text-right py-1"></td><td id="area-s-color" class="text-right py-1"></td><td id="area-s-total" class="text-right py-1 font-bold"></td></tr>
              <tr><td class="py-1 text-green-500 font-medium">Beat</td><td id="area-b-white" class="text-right py-1"></td><td id="area-b-color" class="text-right py-1"></td><td id="area-b-total" class="text-right py-1 font-bold"></td></tr>
              <tr><td class="py-1 text-blue-500 font-medium">Melody</td><td id="area-m-white" class="text-right py-1"></td><td id="area-m-color" class="text-right py-1"></td><td id="area-m-total" class="text-right py-1 font-bold"></td></tr>
            </tbody>
          </table>
        </section>
        <p id="area-placeholder" class="text-xs text-gray-400 dark:text-slate-500 text-center py-6">楽曲と衣装を設定すると楽曲属性面積値が表示されます</p>
      </div>
    </div>
  </div>

  <!-- 衣装選択モーダル -->
  <div id="card-picker-modal" class="fixed inset-0 z-50 hidden">
    <div class="absolute inset-0 bg-black/50" id="modal-backdrop"></div>
    <div class="relative max-w-2xl mx-auto mt-8 mb-8 bg-white dark:bg-slate-800 rounded-lg shadow-xl max-h-[85vh] flex flex-col mx-4 sm:mx-auto">
      <div class="p-4 border-b flex-shrink-0">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-gray-700 dark:text-slate-200">衣装選択 - <span id="modal-slot-label"></span></h3>
          <button id="modal-close-x" type="button" class="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 text-xl leading-none">&times;</button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input type="text" id="modal-search" placeholder="衣装名/キャラ名" class="col-span-2 border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <select id="modal-rarity" class="border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm">
            <option value="">レアリティ</option>
            <option value="UR">UR</option>
            <option value="SSR">SSR</option>
            <option value="SR">SR</option>
            <option value="R">R</option>
          </select>
          <select id="modal-attribute" class="border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm">
            <option value="">属性</option>
            <option value="Shout">Shout</option>
            <option value="Beat">Beat</option>
            <option value="Melody">Melody</option>
          </select>
        </div>
        <div class="mt-2 flex items-center gap-3">
          <label class="flex items-center gap-1 text-xs">
            <input type="checkbox" id="modal-owned-only" checked />
            <span>所持衣装のみ</span>
          </label>
          <span id="modal-result-count" class="text-xs text-gray-500 dark:text-slate-400"></span>
        </div>
      </div>
      <div id="modal-card-list" class="overflow-y-auto flex-1 p-2"></div>
      <div class="p-3 border-t flex justify-between flex-shrink-0">
        <button id="modal-clear" type="button" class="text-sm text-red-500 hover:underline">枠をクリア</button>
        <button id="modal-close" type="button" class="px-4 py-1.5 bg-gray-200 dark:bg-slate-700 rounded text-sm hover:bg-gray-300 dark:hover:bg-slate-600">閉じる</button>
      </div>
    </div>
  </div>
</div>
