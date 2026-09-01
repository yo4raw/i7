<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchCardsJson, type Card } from '../lib/data/fetchCardsJson';
  import { fetchSongsJson, filterValidSongs, firstEventSongId, SONG_NOTE_GROUP_KEYS, type Song } from '../lib/data/fetchSongsJson';
  import SongSelect from './SongSelect.svelte';
  import { fetchFixedBroachsJson, type FixedBroach } from '../lib/data/fetchFixedBroachsJson';
  import { buildLiveTierMap, type EventBonusTier, type EventForBonus } from '../lib/data/eventBonusTiers';
  import { attrDonutSvg } from '../lib/donutChart';
  import { ATTR_HEX } from '../lib/constants';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';
  import { refreshData } from '../lib/data/clientRefresh';
  import { encodeDeckToParams, decodeParamsToDeck, isDeckEmpty } from '../lib/score/deckShareUrl';
  import { createEmptyDeckState, swapSlots, clampSharedBroachs, setCard, clearSlot, SLOT_LABELS } from '../lib/score/deckState';
  import { DEFAULT_SCOREUP_BADGE_RATE } from '../lib/score/constants';
  import { broachViolations, hasRegisteredBroachCounts } from '../lib/score/broachInventory';
  import { SHARED_BROACHS } from '../lib/data/sharedBroachs';
  import { allBroachCounts, reloadBroachCountsFromStorage, totalOwnedBroachs } from '../lib/stores/broachCounts.svelte';
  import { buildBroachRanking } from '../lib/score/songBroachRanking';
  import CardPickerModal from './score/CardPickerModal.svelte';
  import DeckSlots from './score/DeckSlots.svelte';
  import CardDetailTable from './score/CardDetailTable.svelte';
  import ScoreCalcResults from './score/ScoreCalcResults.svelte';
  import BroachRankingChart from './score/BroachRankingChart.svelte';
  import DeckSkillDistribution from './score/DeckSkillDistribution.svelte';
  import ModalDialog from './ui/ModalDialog.svelte';
  import InlineAlert from './ui/InlineAlert.svelte';
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

  // oxlint-disable-next-line no-unassigned-vars -- Svelte bind:this={picker} 代入 (l.394) を静的解析できず誤検知
  let picker: CardPickerModal | undefined;

  const defaultTierMap = buildLiveTierMap(initialEvents);
  function defaultTierFor(card: Card | null): EventBonusTier {
    return card?.ID !== null && card?.ID !== undefined ? (defaultTierMap.get(card.ID) ?? 'none') : 'none';
  }

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
    ? attrDonutSvg(selectedSong.shout_ratio || 0, selectedSong.beat_ratio || 0, selectedSong.melody_ratio || 0, { sizeClass: 'size-20' })
    : '');
  const broachRanking = $derived(selectedSong ? buildBroachRanking(selectedSong) : []);

  // 保存デッキ読込ドロップダウン（null = 閉じている）
  type LoadDeckItem = { id: string; name: string; dateLabel: string; cardCount: number };
  let loadDeckItems = $state<LoadDeckItem[] | null>(null);

  // ボタンの一時フィードバック表示
  let deckSaved = $state(false);
  let shareCopied = $state(false);
  let imageBusy = $state(false);

  /** デッキ操作ボタン群の直下に出すエラー。ネイティブ alert() の置き換え */
  let deckActionError = $state<string | null>(null);

  // oxlint-disable-next-line no-unassigned-vars -- Svelte の bind:this 代入を静的解析できず誤検知
  let dialog: ModalDialog | undefined;

  /** エラーは一定時間で消す (操作をやり直すと再度出る) */
  function showDeckActionError(message: string) {
    deckActionError = message;
    setTimeout(() => { deckActionError = null; }, 4000);
  }

  function handleSongChange(id: number | null) {
    selectedSong = id !== null && id !== undefined ? allSongsState.find(s => s.id === id) || null : null;
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
      scoreUpAssist: !!scoreUpAssist,
      badgeRate: Number(scoreUpBadgeRate) || 0,
      ownedBroachLimit,
    };
  }

  function applyState(state: any) {
    if (state.songId !== null && state.songId !== undefined) {
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
        if (id !== null && id !== undefined) deckState.cards[i] = allCardsState.find(c => c.ID === id) || null;
      }
    }
    for (let i = 0; i < 6; i++) clampSharedBroachs(deckState, i, allBroachsState);
    if (typeof state.scoreUpAssist === 'boolean') scoreUpAssist = state.scoreUpAssist;
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
    if (isDeckEmpty(state)) { showDeckActionError('編成が空です。楽曲や衣装を選んでから共有してください。'); return; }
    deckActionError = null;
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
      // クリップボードが使えない環境向けに、選択してコピーできる形で提示する
      await dialog?.prompt({
        title: 'URL を選択してコピーしてください',
        value: url,
        readonly: true,
      });
    }
  }

  // 編成＋スコアを PNG 画像として保存（data-noshot を付けた操作ボタン類は除外）
  async function shareDeckImage() {
    if (imageBusy) return;
    if (isDeckEmpty(buildStateObject())) { showDeckActionError('編成が空です。楽曲や衣装を選んでから画像化してください。'); return; }
    const node = document.querySelector('#score-share-target');
    if (!node) return;
    deckActionError = null;
    imageBusy = true;
    try {
      const { domToPng } = await import('modern-screenshot');
      const dataUrl = await domToPng(node, {
        scale: 2,
        backgroundColor: '#ffffff',
        filter: (n: Node) => !(n instanceof HTMLElement && Object.hasOwn(n.dataset, "noshot")),
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `i7-score-${selectedSong?.song_name ?? 'deck'}.png`;
      document.body.append(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error(e);
      showDeckActionError('画像の生成に失敗しました。時間をおいて再度お試しください。');
    } finally {
      imageBusy = false;
    }
  }

  type SavedDeck = { id: string; name: string; createdAt: number; updatedAt: number; state: ReturnType<typeof buildStateObject> };

  function loadSavedDecks(): SavedDeck[] { return loadJson<SavedDeck[]>(STORAGE_KEYS.SAVED_DECKS, []); }

  function writeSavedDecks(decks: SavedDeck[]) { saveJson(STORAGE_KEYS.SAVED_DECKS, decks); }

  async function saveDeck() {
    const hasCards = deckState.cards.some(c => c !== null);
    if (!hasCards) { showDeckActionError('デッキに衣装を1枚以上セットしてください'); return; }
    deckActionError = null;

    const defaultName = `デッキ ${loadSavedDecks().length + 1}`;
    const name = await dialog?.prompt({
      title: 'デッキ名を入力してください',
      value: defaultName,
      placeholder: 'デッキ名',
      confirmLabel: '保存する',
    });
    if (!name) return;

    const now = Date.now();
    // ダイアログを開いている間に同期が書き込んでいる可能性があるため読み直す。
    // 開く前の配列を書き戻すと、取り込んだ別端末のデッキを消し、
    // さらに同期層がそれを tombstone としてサーバへ伝播させてしまう
    const existing = loadSavedDecks();
    existing.push({ id: now.toString(36), name: name.trim() || defaultName, createdAt: now, updatedAt: now, state: buildStateObject() });
    writeSavedDecks(existing);

    deckSaved = true;
    setTimeout(() => { deckSaved = false; }, 1500);
  }

  function showLoadDropdown() {
    if (loadDeckItems !== null) { hideLoadDropdown(); return; }
    const decks = loadSavedDecks();
    loadDeckItems = decks.slice().toReversed().map(d => ({
      id: d.id,
      name: d.name,
      dateLabel: new Date(d.updatedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      cardCount: (d.state.deckIds || []).filter((id: number | null) => id !== null && id !== undefined).length,
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
    // 復元結果に楽曲が無ければイベント対象楽曲の先頭を既定に
    if (!selectedSong) {
      const eid = firstEventSongId(allSongsState);
      selectedSong = eid !== null && eid !== undefined ? allSongsState.find(s => s.id === eid) || null : null;
    }

    refreshData('cards', fetchCardsJson, (fresh) => {
      allCardsState = fresh as Card[];
      deckState.cards = deckState.cards.map(c => c ? allCardsState.find(fc => fc.ID === c.ID) || null : null);
    });
    refreshData('songs', async () => filterValidSongs(await fetchSongsJson()), (fresh) => {
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

<div id="score-share-target">
  <!-- 楽曲サマリーバー（全幅・横長） -->
  <section class="surface-card p-4 mb-4">
    <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
      <div class="min-w-0">
        <label for="song-select" class="block text-xs font-bold text-gray-700 mb-2">🎵 楽曲</label>
        <SongSelect id="song-select" songs={allSongsState} value={selectedSong?.id ?? null} onChange={handleSongChange} />
        <div id="song-info" class="mt-3" class:hidden={!selectedSong}>
          <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <div><dt class="text-gray-500 text-[10px]">曲名</dt><dd id="song-name-val" class="font-medium truncate">{selectedSong ? selectedSong.song_name || '-' : ''}</dd></div>
            <div><dt class="text-gray-500 text-[10px]">アーティスト</dt><dd id="song-artist" class="font-medium truncate">{selectedSong ? selectedSong.artist || '-' : ''}</dd></div>
            <div><dt class="text-gray-500 text-[10px]">楽曲種類</dt><dd id="song-type" class="font-medium">{selectedSong ? selectedSong.song_type || '-' : ''}</dd></div>
            <div><dt class="text-gray-500 text-[10px]">ノーツ数</dt><dd id="song-notes" class="font-medium">{selectedSong ? (selectedSong.notes_count || 0).toLocaleString() : ''}</dd></div>
            <div><dt class="text-gray-500 text-[10px]">秒数</dt><dd id="song-duration-val" class="font-medium">{selectedSong ? `${selectedSong.duration || '-'}秒` : ''}</dd></div>
            <div><dt class="text-gray-500 text-[10px]">構成</dt><dd id="song-attr-counts">{#if songAttrCounts}<span style="color:{ATTR_HEX.Shout}">🔴{songAttrCounts.s}</span> <span style="color:{ATTR_HEX.Beat}">🟢{songAttrCounts.b}</span> <span style="color:{ATTR_HEX.Melody}">🔵{songAttrCounts.m}</span>{/if}</dd></div>
          </dl>
          <div class="mt-2 text-right">
            <a id="song-detail-anchor" href={selectedSong ? `${base}songs/${selectedSong.id}/` : '#'} class="text-xs text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-900">楽曲詳細を見る →</a>
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

  <!-- 共通ブローチ スコア寄与 TOP10 -->
  {#if selectedSong && broachRanking.length > 0}
    <details id="broach-ranking-section" class="surface-card mb-4 group" open>
      <summary class="p-4 cursor-pointer font-bold text-sm text-gray-700 flex items-center justify-between select-none">
        <span>🏅 共通ブローチ スコア寄与 TOP10</span>
        <svg class="size-4 text-gray-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </summary>
      <div class="px-4 pb-4 border-t border-gray-100 pt-3">
        <p class="text-[11px] text-gray-500 mb-3">この楽曲のノーツ分布における各共通ブローチ単独のスコア寄与（デッキ非依存の目安）。</p>
        <BroachRankingChart ranking={broachRanking} />
      </div>
    </details>
  {/if}

  <!-- スキルオプション（折りたたみ可、デフォルト開） -->
  <details class="surface-card mb-4 group" open>
    <summary class="p-4 cursor-pointer font-bold text-sm text-gray-700 flex items-center justify-between select-none">
      <span>⚙️ スキルオプション</span>
      <svg class="size-4 text-gray-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
    </summary>
    <div class="px-4 pb-4 border-t border-gray-100 pt-3">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <label class="flex items-center gap-2">
          <input type="checkbox" id="opt-scoreup-assist" class="rounded" bind:checked={scoreUpAssist} onchange={saveState} />
          <span>SCOREUPアシスト（属性値 ×1.2）</span>
        </label>
        <label class="flex items-center gap-2">
          <span class="text-xs text-gray-500 whitespace-nowrap">SCOREUPバッジ倍率</span>
          <input type="number" id="opt-scoreup-badge-rate" class="w-20 border border-gray-300 rounded px-2 py-1 text-sm" min="0" max="100" step="1" bind:value={scoreUpBadgeRate} oninput={saveState} />
          <span class="text-xs text-gray-500">%</span>
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" id="opt-owned-broach-limit" class="rounded" bind:checked={ownedBroachLimit} onchange={saveState} />
          <span>所持ブローチ縛り（共通ブローチを登録した所持数の範囲で選択。フレンド枠は対象外）</span>
        </label>
      </div>
      <p class="text-[11px] text-gray-400 mt-2">バッジ倍率: 0 で未装着、例: 15 → ×1.15</p>
    </div>
  </details>

  <div class="space-y-4">
    <section class="surface-card p-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-bold text-gray-700">🎴 デッキ編成</h2>
        <div class="relative flex gap-2" data-noshot>
          <!-- hover は必ず分岐の中に置く。保存済み(緑)にインクの hover が掛かると AA を割るため -->
          <button id="btn-save-deck" type="button" class="text-xs px-2 py-1 {deckSaved ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-chrome-ink text-white hover:bg-chrome-ink-soft'} rounded transition-colors" onclick={saveDeck}>{deckSaved ? '保存しました' : '保存'}</button>
          <button id="btn-load-deck" type="button" class="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors" onclick={showLoadDropdown}>読込</button>
          <button id="btn-share-url" type="button" class="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors" aria-label="編成シェア URL をコピー" disabled={shareCopied} onclick={shareDeckUrl}>{shareCopied ? '✅ コピーしました' : '🔗 URLコピー'}</button>
          <button id="btn-share-image" type="button" class="text-xs px-2 py-1 bg-sky-100 text-sky-700 rounded hover:bg-sky-200 transition-colors disabled:opacity-60" aria-label="編成とスコアを画像で保存" disabled={imageBusy} onclick={shareDeckImage}>{imageBusy ? '生成中…' : '📷 画像'}</button>
          <div id="load-deck-dropdown" class="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-control shadow-overlay z-(--z-overlay) max-h-60 overflow-y-auto" class:hidden={loadDeckItems === null}>
            {#if loadDeckItems !== null}
              {#if loadDeckItems.length === 0}
                <div class="p-3 text-xs text-gray-400 text-center">保存されたデッキがありません</div>
              {:else}
                {#each loadDeckItems as d (d.id)}
                  <div class="load-deck-item flex items-center justify-between px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-0" data-deck-id={d.id} onclick={() => loadDeck(d.id)} role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') loadDeck(d.id); }}>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-medium text-gray-700 truncate">{d.name}</div>
                      <div class="text-[10px] text-gray-400">{d.dateLabel} / {d.cardCount}枚</div>
                    </div>
                  </div>
                {/each}
                <a href="{base}decks/" class="block text-center text-[10px] text-gray-600 hover:text-gray-900 py-2 border-t border-gray-100">デッキ管理ページ →</a>
              {/if}
            {/if}
          </div>
        </div>
      </div>
      <!-- 保存/共有/画像化の失敗理由は、押したボタン群の直下に出す -->
      <InlineAlert message={deckActionError} class="mb-2 text-right" />
      <DeckSlots deckState={deckState} selectedSong={selectedSong} allBroachs={allBroachsState} onSlotClick={handleSlotClick} onSwap={handleSwap} onChanged={saveState} ownedBroachLimit={ownedBroachLimit} broachCounts={broachCounts} />
      {#if ownedBroachLimit && totalOwnedBroachs() === 0}
        <p class="mt-2 text-xs text-amber-600">共通ブローチが未登録です。<a class="underline" href={`${base}shared-broach/`}>共通ブローチ登録ページ</a>で所持数を登録してください。</p>
      {/if}
      {#if hasRegisteredBroachCounts(broachCounts) && violationNames.length > 0}
        <p class="mt-2 text-xs text-red-600 text-pretty">⚠️ 所持数を超える共通ブローチが装備されています: {violationNames.join('、')}（装備はそのまま残ります。選び直すと所持数の範囲に制限されます）</p>
      {/if}
    </section>

    <CardDetailTable deckState={deckState} selectedSong={selectedSong} allBroachs={allBroachsState} scoreUpAssist={scoreUpAssist} />

    <DeckSkillDistribution deckState={deckState} selectedSong={selectedSong} allBroachs={allBroachsState} scoreUpAssist={scoreUpAssist} scoreUpBadgeRate={scoreUpBadgeRate} />

    <ScoreCalcResults deckState={deckState} selectedSong={selectedSong} allBroachs={allBroachsState} scoreUpAssist={scoreUpAssist} scoreUpBadgeRate={scoreUpBadgeRate} />
  </div>

  <div data-noshot>
    <CardPickerModal bind:this={picker} allCards={allCardsState} onPick={handlePick} onClear={handleClear} />
    <ModalDialog bind:this={dialog} />
  </div>
</div>
