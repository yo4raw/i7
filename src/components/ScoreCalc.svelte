<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchCardsJson, type Card } from '../lib/data/fetchCardsJson';
  import { fetchSongsJson, filterValidSongs, filterAllowedSongs, SONG_NOTE_GROUP_KEYS, type Song } from '../lib/data/fetchSongsJson';
  import { fetchFixedBroachsJson, type FixedBroach } from '../lib/data/fetchFixedBroachsJson';
  import { buildLiveTierMap, type EventBonusTier, type EventForBonus } from '../lib/data/eventBonusTiers';
  import { attrDonutSvg } from '../lib/donutChart';
  import { ATTR_HEX } from '../lib/constants';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';
  import { refreshData } from '../lib/data/clientRefresh';
  import { encodeDeckToParams, decodeParamsToDeck, isDeckEmpty } from '../lib/score/deckShareUrl';
  import { createEmptyDeckState, swapSlots, clampSharedBroachs, setCard, clearSlot, SLOT_LABELS } from '../lib/score/deckState';
  import { DEFAULT_SCOREUP_BADGE_RATE } from '../lib/score/constants';
  import { broachViolations } from '../lib/score/broachInventory';
  import { SHARED_BROACHS } from '../lib/data/sharedBroachs';
  import { allBroachCounts, reloadBroachCountsFromStorage, totalOwnedBroachs } from '../lib/stores/broachCounts.svelte';
  import CardPickerModal from './score/CardPickerModal.svelte';
  import DeckSlots from './score/DeckSlots.svelte';
  import CardDetailTable from './score/CardDetailTable.svelte';
  import ScoreCalcResults from './score/ScoreCalcResults.svelte';
  type Props = { cards: Card[]; songs: Song[]; broachs: FixedBroach[]; events: EventForBonus[]; base: string };

  let { cards: initialCards, songs: initialSongs, broachs: initialBroachs, events: initialEvents, base }: Props = $props();

  const deckState = $state(createEmptyDeckState());
  let allCardsState = $state<Card[]>(initialCards);
  let allSongsState = $state<Song[]>(initialSongs);
  let allBroachsState = $state<FixedBroach[]>(initialBroachs);
  let selectedSong = $state<Song | null>(null);

  // スキルオプション
  let scoreUpAssist = $state(false);
  let scoreUpBadgeRate = $state(DEFAULT_SCOREUP_BADGE_RATE);

  // 所持ブローチ縛り (共通ブローチの選択肢を登録した所持数で制限。フレンド枠は対象外)
  let ownedBroachLimit = $state(false);
  const broachCounts = $derived(allBroachCounts());
  const violationNames = $derived(
    broachViolations(deckState.sharedBroachs, broachCounts)
      .map((id) => SHARED_BROACHS.find((sb) => sb.id === id)?.name ?? `#${id}`)
  );

  let picker: CardPickerModal | undefined;

  const defaultTierMap = buildLiveTierMap(initialEvents);
  function defaultTierFor(card: Card | null): EventBonusTier {
    return card?.ID != null ? (defaultTierMap.get(card.ID) ?? 'none') : 'none';
  }

  // 楽曲セレクト用の派生値（選択中の曲 optgroup + カテゴリ別 optgroup）
  const pickedSongs = $derived.by(() => {
    const pickedIds = new Set(loadJson<number[]>(STORAGE_KEYS.SELECTED_SONGS, []));
    return allSongsState.filter(s => s.id != null && pickedIds.has(s.id)).sort((a, b) => (a.duration || 0) - (b.duration || 0));
  });
  const categorizedSongs = $derived.by(() => {
    const groups = new Map<string, Song[]>();
    for (const s of allSongsState) {
      const cat = s.category || 'その他';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(s);
    }
    return [...groups];
  });

  // 楽曲サマリー表示用の派生値
  const songAttrCounts = $derived.by(() => {
    if (!selectedSong) return null;
    let s = 0, b = 0, m = 0;
    for (const gk of SONG_NOTE_GROUP_KEYS) {
      const g = selectedSong[gk];
      if (!g) continue;
      s += (g.shout_white || 0) + (g.shout_color || 0);
      b += (g.beat_white || 0) + (g.beat_color || 0);
      m += (g.melody_white || 0) + (g.melody_color || 0);
    }
    return { s, b, m };
  });
  const songChartSvg = $derived(selectedSong
    ? attrDonutSvg(selectedSong.shout_ratio || 0, selectedSong.beat_ratio || 0, selectedSong.melody_ratio || 0, { sizeClass: 'w-20 h-20' })
    : '');

  // 保存デッキ読込ドロップダウン（null = 閉じている）
  type LoadDeckItem = { id: string; name: string; dateLabel: string; cardCount: number };
  let loadDeckItems = $state<LoadDeckItem[] | null>(null);

  // ボタンの一時フィードバック表示
  let deckSaved = $state(false);
  let shareCopied = $state(false);

  function handleSongChange(e: Event) {
    const id = Number((e.currentTarget as HTMLSelectElement).value);
    selectedSong = allSongsState.find(s => s.id === id) || null;
    saveState();
  }
  function handlePick(slot: number, card: Card) { setCard(deckState, slot, card, defaultTierFor(card), allBroachsState); saveState(); }
  function handleClear(slot: number) { clearSlot(deckState, slot); saveState(); }
  function handleSlotClick(slot: number) { picker!.open(slot, SLOT_LABELS[slot]); }
  function handleSwap(a: number, b: number) { swapSlots(deckState, a, b); saveState(); }

  function buildStateObject() {
    return {
      songId: selectedSong?.id ?? null,
      deckIds: deckState.cards.map(c => c?.ID ?? null),
      bonusTiers: [...deckState.bonusTiers],
      trained: [...deckState.trained],
      sharedBroachs: deckState.sharedBroachs.map(a => [...a]),
      skillLevels: [...deckState.skillLevels],
      badgeRate: Number(scoreUpBadgeRate) || 0,
      ownedBroachLimit,
    };
  }

  function applyState(state: any) {
    if (state.songId != null) {
      const song = allSongsState.find(s => s.id === state.songId);
      if (song) selectedSong = song;
    } else {
      selectedSong = null;
    }
    for (let i = 0; i < 6; i++) {
      if (Array.isArray(state.bonusTiers)) deckState.bonusTiers[i] = state.bonusTiers[i] || 'none';
      if (Array.isArray(state.trained)) deckState.trained[i] = state.trained[i] !== false;
      if (Array.isArray(state.sharedBroachs)) deckState.sharedBroachs[i] = Array.isArray(state.sharedBroachs[i]) ? state.sharedBroachs[i] : [];
      if (Array.isArray(state.skillLevels)) {
        const lv = state.skillLevels[i];
        deckState.skillLevels[i] = (lv >= 1 && lv <= 5) ? lv : 5;
      }
    }
    deckState.cards = [null, null, null, null, null, null];
    if (Array.isArray(state.deckIds)) {
      for (let i = 0; i < 6; i++) {
        const id = state.deckIds[i];
        if (id != null) deckState.cards[i] = allCardsState.find(c => c.ID === id) || null;
      }
    }
    for (let i = 0; i < 6; i++) clampSharedBroachs(deckState, i, allBroachsState);
    if (typeof state.badgeRate === 'number') scoreUpBadgeRate = state.badgeRate;
    if (typeof state.ownedBroachLimit === 'boolean') ownedBroachLimit = state.ownedBroachLimit;
  }

  function saveState() { saveJson(STORAGE_KEYS.SCORE_CALC_STATE, buildStateObject()); }

  function restoreState() {
    const state = loadJson<ReturnType<typeof buildStateObject> | null>(STORAGE_KEYS.SCORE_CALC_STATE, null);
    if (state) applyState(state);
  }

  function tryRestoreFromUrl(): boolean {
    if (typeof window === 'undefined' || !window.location.search) return false;
    const params = new URLSearchParams(window.location.search);
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
    if (isDeckEmpty(state)) { alert('編成が空です。楽曲や衣装を選んでから共有してください。'); return; }
    const params = encodeDeckToParams(state);
    const url = `${window.location.origin}${base}score-calc/?${params.toString()}`;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); copied = true; }
    } catch { copied = false; }
    if (copied) {
      shareCopied = true;
      setTimeout(() => { shareCopied = false; }, 2000);
    } else {
      window.prompt('URL を選択してコピーしてください', url);
    }
  }

  type SavedDeck = { id: string; name: string; createdAt: number; updatedAt: number; state: ReturnType<typeof buildStateObject> };

  function loadSavedDecks(): SavedDeck[] { return loadJson<SavedDeck[]>(STORAGE_KEYS.SAVED_DECKS, []); }

  function writeSavedDecks(decks: SavedDeck[]) { saveJson(STORAGE_KEYS.SAVED_DECKS, decks); }

  function saveDeck() {
    const hasCards = deckState.cards.some(c => c !== null);
    if (!hasCards) { alert('デッキに衣装を1枚以上セットしてください'); return; }

    const existing = loadSavedDecks();
    const defaultName = `デッキ ${existing.length + 1}`;
    const name = prompt('デッキ名を入力してください', defaultName);
    if (!name) return;

    const now = Date.now();
    existing.push({ id: now.toString(36), name: name.trim() || defaultName, createdAt: now, updatedAt: now, state: buildStateObject() });
    writeSavedDecks(existing);

    deckSaved = true;
    setTimeout(() => { deckSaved = false; }, 1500);
  }

  function showLoadDropdown() {
    if (loadDeckItems !== null) { hideLoadDropdown(); return; }
    const decks = loadSavedDecks();
    loadDeckItems = decks.slice().reverse().map(d => ({
      id: d.id,
      name: d.name,
      dateLabel: new Date(d.updatedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      cardCount: (d.state.deckIds || []).filter((id: number | null) => id != null).length,
    }));
  }

  function hideLoadDropdown() { loadDeckItems = null; }

  function loadDeck(deckId: string) {
    const target = loadSavedDecks().find(d => d.id === deckId);
    if (!target) return;
    applyState(target.state);
    saveState();
    hideLoadDropdown();
  }

  onMount(() => {
    reloadBroachCountsFromStorage();
    if (!tryRestoreFromUrl()) restoreState();

    refreshData('cards', fetchCardsJson, (fresh) => {
      allCardsState = fresh as Card[];
      deckState.cards = deckState.cards.map(c => c ? allCardsState.find(fc => fc.ID === c.ID) || null : null);
    });
    refreshData('songs', async () => filterAllowedSongs(filterValidSongs(await fetchSongsJson())), (fresh) => {
      allSongsState = fresh as Song[];
      if (selectedSong) selectedSong = allSongsState.find(s => s.id === selectedSong!.id) || null;
    });
    refreshData('broachs', fetchFixedBroachsJson, (fresh) => {
      allBroachsState = fresh as FixedBroach[];
    });

    // dropdown 外側クリックで閉じる（document レベル）
    const bodyClickHandler = (e: MouseEvent) => {
      if (loadDeckItems !== null &&
          !(e.target as HTMLElement).closest('#load-deck-dropdown') &&
          !(e.target as HTMLElement).closest('#btn-load-deck')) {
        hideLoadDropdown();
      }
    };
    document.addEventListener('click', bodyClickHandler);
    return () => document.removeEventListener('click', bodyClickHandler);
  });
</script>

<div>
  <!-- 楽曲サマリーバー（全幅・横長） -->
  <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
    <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
      <div class="min-w-0">
        <label for="song-select" class="block text-xs font-bold text-gray-700 dark:text-slate-200 mb-2">🎵 楽曲</label>
        <select id="song-select" class="w-full border border-gray-300 dark:border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" value={selectedSong?.id != null ? String(selectedSong.id) : ''} onchange={handleSongChange}>
          <option value="">楽曲を選択</option>
          {#if pickedSongs.length > 0}
            <optgroup label={`選択中の曲（${pickedSongs.length}曲・秒数順）`}>
              {#each pickedSongs as s (s.id)}
                <option value={String(s.id)}>{s.song_name} ({s.difficulty || ''}) - {s.duration || '?'}秒</option>
              {/each}
            </optgroup>
          {/if}
          {#each categorizedSongs as [cat, songs] (cat)}
            <optgroup label={cat}>
              {#each songs as s}
                <option value={String(s.id)}>{s.song_name} ({s.difficulty || ''})</option>
              {/each}
            </optgroup>
          {/each}
        </select>
        <div id="song-info" class="mt-3" class:hidden={!selectedSong}>
          <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <div><dt class="text-gray-500 dark:text-slate-400 text-[10px]">曲名</dt><dd id="song-name-val" class="font-medium truncate">{selectedSong ? selectedSong.song_name || '-' : ''}</dd></div>
            <div><dt class="text-gray-500 dark:text-slate-400 text-[10px]">アーティスト</dt><dd id="song-artist" class="font-medium truncate">{selectedSong ? selectedSong.artist || '-' : ''}</dd></div>
            <div><dt class="text-gray-500 dark:text-slate-400 text-[10px]">楽曲種類</dt><dd id="song-type" class="font-medium">{selectedSong ? selectedSong.song_type || '-' : ''}</dd></div>
            <div><dt class="text-gray-500 dark:text-slate-400 text-[10px]">ノーツ数</dt><dd id="song-notes" class="font-medium">{selectedSong ? (selectedSong.notes_count || 0).toLocaleString() : ''}</dd></div>
            <div><dt class="text-gray-500 dark:text-slate-400 text-[10px]">秒数</dt><dd id="song-duration-val" class="font-medium">{selectedSong ? `${selectedSong.duration || '-'}秒` : ''}</dd></div>
            <div><dt class="text-gray-500 dark:text-slate-400 text-[10px]">構成</dt><dd id="song-attr-counts">{#if songAttrCounts}<span style="color:{ATTR_HEX.Shout}">🔴{songAttrCounts.s}</span> <span style="color:{ATTR_HEX.Beat}">🟢{songAttrCounts.b}</span> <span style="color:{ATTR_HEX.Melody}">🔵{songAttrCounts.m}</span>{/if}</dd></div>
          </dl>
          <div class="mt-2 text-right">
            <a id="song-detail-anchor" href={selectedSong ? `${base}songs/${selectedSong.id}/` : '#'} class="text-xs text-indigo-600 hover:underline">楽曲詳細を見る →</a>
          </div>
        </div>
      </div>
      <div id="song-info-chart" class="flex items-center gap-3 md:border-l md:border-gray-200 md:pl-4 md:min-w-[180px]">
        <div id="song-chart" class="flex-shrink-0">{#if selectedSong}{@html songChartSvg}{/if}</div>
        <div id="song-ratios" class="text-[11px] space-y-0.5">
          {#if selectedSong}
            <div style="color:{ATTR_HEX.Shout}">Shout: {Math.round((selectedSong.shout_ratio || 0) * 100)}%</div>
            <div style="color:{ATTR_HEX.Beat}">Beat: {Math.round((selectedSong.beat_ratio || 0) * 100)}%</div>
            <div style="color:{ATTR_HEX.Melody}">Melody: {Math.round((selectedSong.melody_ratio || 0) * 100)}%</div>
          {/if}
        </div>
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
          <input type="checkbox" id="opt-scoreup-assist" class="rounded" bind:checked={scoreUpAssist} />
          <span>SCOREUPアシスト（属性値 ×1.2）</span>
        </label>
        <label class="flex items-center gap-2">
          <span class="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">SCOREUPバッジ倍率</span>
          <input type="number" id="opt-scoreup-badge-rate" class="w-20 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm" min="0" max="100" step="1" bind:value={scoreUpBadgeRate} oninput={saveState} />
          <span class="text-xs text-gray-500 dark:text-slate-400">%</span>
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" id="opt-owned-broach-limit" class="rounded" bind:checked={ownedBroachLimit} onchange={saveState} />
          <span>所持ブローチ縛り（共通ブローチを登録した所持数の範囲で選択。フレンド枠は対象外）</span>
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
          <button id="btn-save-deck" type="button" class="text-xs px-2 py-1 {deckSaved ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'} rounded hover:bg-indigo-200 transition-colors" onclick={saveDeck}>{deckSaved ? '保存しました' : '保存'}</button>
          <button id="btn-load-deck" type="button" class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors" onclick={showLoadDropdown}>読込</button>
          <button id="btn-share-url" type="button" class="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors" aria-label="編成シェア URL をコピー" disabled={shareCopied} onclick={shareDeckUrl}>{shareCopied ? '✅ コピーしました' : '🔗 URLコピー'}</button>
          <div id="load-deck-dropdown" class="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto" class:hidden={loadDeckItems === null}>
            {#if loadDeckItems !== null}
              {#if loadDeckItems.length === 0}
                <div class="p-3 text-xs text-gray-400 dark:text-slate-500 text-center">保存されたデッキがありません</div>
              {:else}
                {#each loadDeckItems as d (d.id)}
                  <div class="load-deck-item flex items-center justify-between px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 dark:border-slate-800 last:border-0" data-deck-id={d.id} onclick={() => loadDeck(d.id)} role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') loadDeck(d.id); }}>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-medium text-gray-700 dark:text-slate-200 truncate">{d.name}</div>
                      <div class="text-[10px] text-gray-400 dark:text-slate-500">{d.dateLabel} / {d.cardCount}枚</div>
                    </div>
                  </div>
                {/each}
                <a href="{base}decks/" class="block text-center text-[10px] text-indigo-500 hover:text-indigo-700 py-2 border-t border-gray-100 dark:border-slate-800">デッキ管理ページ →</a>
              {/if}
            {/if}
          </div>
        </div>
      </div>
      <DeckSlots deckState={deckState} selectedSong={selectedSong} allBroachs={allBroachsState} onSlotClick={handleSlotClick} onSwap={handleSwap} onChanged={saveState} ownedBroachLimit={ownedBroachLimit} broachCounts={broachCounts} />
      {#if ownedBroachLimit && totalOwnedBroachs() === 0}
        <p class="mt-2 text-xs text-amber-600">共通ブローチが未登録です。<a class="underline" href={`${base}shared-broach/`}>共通ブローチ登録ページ</a>で所持数を登録してください。</p>
      {/if}
      {#if ownedBroachLimit && violationNames.length > 0}
        <p class="mt-2 text-xs text-red-600">⚠️ 所持数を超える共通ブローチが装備されています: {violationNames.join('、')}（装備はそのまま残ります。選び直すと所持数の範囲に制限されます）</p>
      {/if}
    </section>

    <CardDetailTable deckState={deckState} selectedSong={selectedSong} allBroachs={allBroachsState} scoreUpAssist={scoreUpAssist} />

    <ScoreCalcResults deckState={deckState} selectedSong={selectedSong} allBroachs={allBroachsState} scoreUpAssist={scoreUpAssist} scoreUpBadgeRate={scoreUpBadgeRate} />
  </div>

  <CardPickerModal bind:this={picker} allCards={allCardsState} onPick={handlePick} onClear={handleClear} />
</div>
