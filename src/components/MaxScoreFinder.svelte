<script lang="ts">
  import { onMount } from 'svelte';
  import type { Card } from '../lib/data/fetchCardsJson';
  import type { Song } from '../lib/data/fetchSongsJson';
  import type { FixedBroach } from '../lib/data/fetchFixedBroachsJson';
  import { normalizeAttribute } from '../lib/score/types';
  import {
    countCombos,
    createSearchContext,
    generateChunks,
    mergeTopK,
    evaluateFriendSwap,
    isShrinkCard,
    TOP_K,
    type SearchInput,
    type SearchResult,
  } from '../lib/score/maxScoreFinder';
  import { startWorkerSearch, type SearchPoolRun } from '../lib/score/searchWorkerPool';
  import { DEFAULT_SCOREUP_BADGE_RATE } from '../lib/score/constants';
  import { buildTierMapForEvent, isEventLive, isHighScoreEvent } from '../lib/data/eventBonusTiers';
  import type { EventBonusTier, EventForBonus } from '../lib/data/eventBonusTiers';
  import { loadJson, saveJson, STORAGE_KEYS } from '../lib/storage';
  import { ATTR_HEX } from '../lib/constants';
  import SearchResults from './score/SearchResults.svelte';
  import { formatElapsed } from '../lib/ui';
  import { loadRabbitNotes } from '../lib/data/rabbitNote';
  import { refreshData } from '../lib/data/clientRefresh';
  import { fetchCardsJson } from '../lib/data/fetchCardsJson';
  import { fetchSongsJson, filterValidSongs, firstEventSongId } from '../lib/data/fetchSongsJson';
  import SongSelect from './SongSelect.svelte';
  import { fetchFixedBroachsJson } from '../lib/data/fetchFixedBroachsJson';
  import { allCounts, reloadFromStorage as reloadCardCounts } from '../lib/stores/cardCounts.svelte';
  import { allBroachCounts, reloadBroachCountsFromStorage, totalOwnedBroachs } from '../lib/stores/broachCounts.svelte';

  type LiveEvent = EventForBonus & { eventname: string; eventtype: string };

  type Props = {
    cards: Card[];
    songs: Song[];
    broachs: FixedBroach[];
    events: LiveEvent[];
    base: string;
  };

  let { cards: initialCards, songs: initialSongs, broachs: initialBroachs, events: initialEvents, base }: Props = $props();

  let allCards = $state<Card[]>(initialCards);
  let allSongs = $state<Song[]>(initialSongs);
  let allBroachs = $state<FixedBroach[]>(initialBroachs);
  const allEventsData = initialEvents;

  // ハイスコアライブイベントを新しい順に。開催中があれば既定選択。
  const highScoreEvents = [...allEventsData]
    .filter((ev) => isHighScoreEvent(ev.eventtype))
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  const defaultEventId =
    highScoreEvents.find((ev) => isEventLive(ev.start_date, ev.end_date))?.id
    ?? highScoreEvents[0]?.id
    ?? null;
  let selectedEventId = $state<number | null>(defaultEventId);
  let mounted = $state(false);

  let selectedSongId = $state<number | null>(null);
  let evalMode = $state<'expected' | 'max'>('expected');
  let scoreUpAssist = $state(false);
  let scoreUpBadgeRate = $state(DEFAULT_SCOREUP_BADGE_RATE);
  let ownedOnly = $state(false);
  let shrinkPairOnly = $state(false);
  let useOwnedBroachs = $state(false);
  const ownedBroachTotal = $derived(totalOwnedBroachs());

  let now = $state(Date.now());

  let searching = $state(false);
  let progressPct = $state(0);
  let progressText = $state('');
  let lastResult = $state<SearchResult | null>(null);
  let abortRequested = false;
  let activeRun: SearchPoolRun | null = null;

  $effect(() => {
    const id = setInterval(() => { now = Date.now(); }, 60_000);
    return () => clearInterval(id);
  });

  // アイランド破棄時に探索中の Worker を解放する (フルページ遷移では不要だが将来の SPA 化への保険)
  $effect(() => {
    return () => {
      activeRun?.terminate();
      activeRun = null;
    };
  });

  $effect(() => {
    refreshData('cards', fetchCardsJson, (fresh) => { allCards = fresh as Card[]; });
    refreshData('songs', async () => filterValidSongs(await fetchSongsJson()), (fresh) => { allSongs = fresh as Song[]; });
    refreshData('broachs', fetchFixedBroachsJson, (fresh) => { allBroachs = fresh as FixedBroach[]; });
    reloadCardCounts();
    reloadBroachCountsFromStorage();
  });

  // 選択中イベントを localStorage から復元（保存値が現存するハイスコアイベントのときのみ採用）
  onMount(() => {
    const saved = loadJson<number | null>(STORAGE_KEYS.MAX_FINDER_EVENT_ID, null);
    if (saved != null && highScoreEvents.some((ev) => ev.id === saved)) {
      selectedEventId = saved;
    }
    mounted = true;
  });

  // 選択中イベントを localStorage へ保存
  $effect(() => {
    if (!mounted) return;
    saveJson(STORAGE_KEYS.MAX_FINDER_EVENT_ID, selectedEventId);
  });

  const selectedSong = $derived(selectedSongId != null ? allSongs.find((s) => s.id === selectedSongId) ?? null : null);

  // 初期選択曲: イベント対象楽曲の先頭。無ければ未選択のまま
  $effect(() => {
    if (selectedSongId != null || allSongs.length === 0) return;
    selectedSongId = firstEventSongId(allSongs);
  });

  const selectedEvent = $derived(highScoreEvents.find((ev) => ev.id === selectedEventId) ?? null);
  const currentTierMap = $derived(
    selectedEvent ? buildTierMapForEvent(selectedEvent) : new Map<number, EventBonusTier>(),
  );
  const currentCandidates = $derived.by(() => {
    if (!selectedEvent) return [] as Card[];
    const goldSilverIds = new Set<number>([...selectedEvent.gold, ...selectedEvent.silver]);
    return allCards.filter((c) => c.rarity === 'UR' && c.ID != null && goldSilverIds.has(c.ID));
  });

  const goldCandidates = $derived(currentCandidates.filter((c) => currentTierMap.get(c.ID!) === 'gold'));
  const silverCandidates = $derived(currentCandidates.filter((c) => currentTierMap.get(c.ID!) === 'silver'));

  const shrinkCandidates = $derived(currentCandidates.filter((c) => isShrinkCard(c)));

  const cardCounts = $derived(allCounts());
  const ownedCountOf = (card: Card): number => (card.ID == null ? 0 : cardCounts[String(card.ID)] ?? 0);
  const ownedCandidates = $derived(currentCandidates.filter((c) => ownedCountOf(c) >= 1));
  const ownedGoldCount = $derived(goldCandidates.filter((c) => ownedCountOf(c) >= 1).length);
  const ownedSilverCount = $derived(silverCandidates.filter((c) => ownedCountOf(c) >= 1).length);

  /**
   * 現在の UI 状態から探索入力を構築する。
   * $state プロキシは Worker へ structured clone で送信できないため
   * $state.snapshot でプレーン化する。
   */
  function buildSearchInput(): SearchInput | null {
    if (!selectedSong) return null;
    const tierByCardId: Record<string, EventBonusTier> = {};
    for (const c of currentCandidates) {
      if (c.ID != null) tierByCardId[String(c.ID)] = currentTierMap.get(c.ID) ?? 'none';
    }
    const ownedCounts: Record<string, number> = {};
    for (const c of ownedCandidates) {
      if (c.ID != null) ownedCounts[String(c.ID)] = ownedCountOf(c);
    }
    return $state.snapshot({
      evalMode,
      ownedOnly,
      shrinkPairOnly,
      scoreOptions: { scoreUpAssist, scoreUpBadgeRate },
      candidates: currentCandidates,
      ownedCounts,
      song: selectedSong,
      broachs: allBroachs,
      tierByCardId,
      rabbitNotes: loadRabbitNotes(),
      useOwnedBroachs: useOwnedBroachs && ownedBroachTotal > 0,
      sharedBroachCounts: { ...allBroachCounts() },
    }) as SearchInput;
  }

  const comboCount = $derived.by(() => {
    const input = buildSearchInput();
    if (!input) return 0;
    return countCombos(createSearchContext(input));
  });

  const searchDisabled = $derived(
    !selectedSong || currentCandidates.length < 1 || searching
      || (ownedOnly && ownedCandidates.length < 1)
      || comboCount === 0
  );
  const searchDisabledReason = $derived(
    !selectedSong ? '楽曲を選択してください'
      : currentCandidates.length < 1 ? '選択中イベントに金/銀特効 UR 衣装がありません'
      : ownedOnly && ownedCandidates.length < 1 ? '所持している金/銀特効 UR 衣装がありません'
      : ownedOnly && comboCount === 0 && !shrinkPairOnly ? '所持枚数の合計が 5 枚（センター+メンバー4枚分）に満たないため組合せがありません'
      : shrinkPairOnly && comboCount === 0 ? '判定縮小2枚以上編成の条件を満たす組合せが作れません（縮小持ち特効候補の不足など）'
      : ownedOnly && comboCount === 0 ? '所持枚数の合計が 5 枚（センター+メンバー4枚分）に満たないため組合せがありません'
      : ''
  );

  async function runSearch() {
    const input = buildSearchInput();
    if (!input || input.candidates.length < 1) return;

    const ctx = createSearchContext(input);
    const totalEvals = countCombos(ctx);
    if (totalEvals > 5_000_000) {
      const estMinutes = Math.ceil(totalEvals / 300_000 / 60);
      const ok = confirm(
        `評価する組合せが ${totalEvals.toLocaleString()} 通りあります。\n計算時間は目安として ${estMinutes} 分以上かかる可能性があります。\n続行しますか？`
      );
      if (!ok) return;
    }

    abortRequested = false;
    searching = true;
    progressPct = 0;
    progressText = '準備中…';

    const chunks = [...generateChunks(ctx)];
    const workerCount = Math.min(
      8,
      Math.max(1, (navigator.hardwareConcurrency || 4) - 1),
      Math.max(1, chunks.length),
    );

    const t0 = performance.now();

    const updateProgress = (evaluated: number, provisionalBest: number | null) => {
      const pct = Math.min(100, Math.round((evaluated / Math.max(1, totalEvals)) * 100));
      progressPct = pct;
      const speed = evaluated / ((performance.now() - t0) / 1000);
      const etaSec = Math.max(0, (totalEvals - evaluated) / Math.max(1, speed));
      progressText = `探索中… ${pct}%（${workerCount}並列, ${evaluated.toLocaleString()} / ${totalEvals.toLocaleString()}, 残り約 ${formatElapsed(etaSec * 1000)}, 暫定 1位: ${provisionalBest != null ? provisionalBest.toLocaleString() : '-'}）`;
    };

    try {
      const run = startWorkerSearch(input, chunks, workerCount, updateProgress);
      activeRun = run; // requestAbort / アイランド破棄から abort・terminate するため探索中のみ共有
      const { localTops, evaluated, aborted } = await run.promise;

      const elapsedMs = Math.round(performance.now() - t0);
      const top = mergeTopK(localTops, TOP_K);

      if (top.length === 0) {
        alert('評価できる組合せがありませんでした');
      } else {
        // 最適編成の center + member1..4 を固定し、friend だけ全候補に切り替えて Top 5 を抽出
        const topFriends = evaluateFriendSwap(ctx, top[0].cardIds);
        lastResult = {
          best: top[0],
          top,
          topFriends,
          evaluated,
          elapsedMs,
          evalMode: input.evalMode,
          aborted: abortRequested || aborted,
        };
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '探索中にエラーが発生しました');
    } finally {
      activeRun = null;
      searching = false;
    }
  }

  function requestAbort() {
    abortRequested = true;
    activeRun?.abort();
  }
</script>

<section class="bg-white rounded-lg shadow p-4 mb-4">
  <label for="song-select" class="block text-xs font-bold text-gray-700 mb-2">🎵 楽曲</label>
  <SongSelect id="song-select" songs={allSongs} bind:value={selectedSongId} />
  {#if selectedSong}
    <div class="mt-3 text-xs text-gray-600">
      <div class="flex flex-wrap gap-3">
        <span><b>{selectedSong.song_name}</b></span>
        <span class="text-gray-400">|</span>
        <span>{selectedSong.difficulty || '-'} / {selectedSong.duration || '?'}秒 / {(selectedSong.notes_count || 0).toLocaleString()}ノーツ</span>
        <span class="text-gray-400">|</span>
        <span style="color:{ATTR_HEX.Shout}">Shout {Math.round((selectedSong.shout_ratio || 0) * 100)}%</span>
        <span style="color:{ATTR_HEX.Beat}">Beat {Math.round((selectedSong.beat_ratio || 0) * 100)}%</span>
        <span style="color:{ATTR_HEX.Melody}">Melody {Math.round((selectedSong.melody_ratio || 0) * 100)}%</span>
      </div>
    </div>
  {/if}
</section>

<section class="bg-white rounded-lg shadow p-4 mb-4">
  <h2 class="text-sm font-bold text-gray-700 mb-2">📅 対象イベント</h2>
  <div class="text-xs text-gray-600">
    {#if highScoreEvents.length === 0}
      <p class="text-gray-400">対象となるハイスコアライブイベントがありません。</p>
    {:else}
      <label class="flex items-center gap-2 mb-2">
        <span class="text-gray-600 shrink-0">イベント</span>
        <select
          aria-label="対象イベント"
          class="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white max-w-72 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={selectedEventId == null ? '' : String(selectedEventId)}
          onchange={(e) => {
            const v = e.currentTarget.value;
            selectedEventId = v === '' ? null : Number(v);
          }}
        >
          {#each highScoreEvents as ev (ev.id)}
            <option value={String(ev.id)}>{isEventLive(ev.start_date, ev.end_date, now) ? '【開催中】' : ''}{ev.eventname}（{ev.start_date}〜）</option>
          {/each}
        </select>
      </label>
      <div class="mb-2">
        <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-400 mr-1">金特効</span>
        <b>{goldCandidates.length}</b> 枚{#if ownedOnly}<span class="text-gray-400 text-[10px]">（所持 {ownedGoldCount}）</span>{/if}
        <span class="ml-3 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-700 border border-gray-400 mr-1">銀特効</span>
        <b>{silverCandidates.length}</b> 枚{#if ownedOnly}<span class="text-gray-400 text-[10px]">（所持 {ownedSilverCount}）</span>{/if}
        <span class="ml-3">候補合計 <b>{currentCandidates.length}</b> 枚{#if ownedOnly}<span class="text-gray-400 text-[10px]">（所持 {ownedCandidates.length}）</span>{/if} → 評価する組合せ <b>{comboCount.toLocaleString()}</b> 通り</span>
      </div>
      <details class="mt-2">
        <summary class="cursor-pointer text-[11px] text-indigo-600">候補衣装を展開</summary>
        <div class="mt-2">
          <div class="text-[11px] font-bold text-yellow-700">金特効（{goldCandidates.length}枚）</div>
          <div>
            {#each goldCandidates.slice(0, 30) as c}
              {@const attr = normalizeAttribute(c.attribute)}
              {@const attrColor = ATTR_HEX[attr] || '#6b7280'}
              <span class="inline-flex items-center gap-1 mr-1 mb-1 px-1.5 py-0.5 text-[10px] rounded border" style="border-color:{attrColor}; color:{attrColor}">
                {c.cardname || ''}<span class="text-gray-400">({c.name || ''})</span>
              </span>
            {/each}
            {#if goldCandidates.length > 30}
              <span class="text-[10px] text-gray-400">…他 {goldCandidates.length - 30}枚</span>
            {/if}
          </div>
          <div class="mt-2 text-[11px] font-bold text-gray-500">銀特効（{silverCandidates.length}枚）</div>
          <div>
            {#each silverCandidates.slice(0, 30) as c}
              {@const attr = normalizeAttribute(c.attribute)}
              {@const attrColor = ATTR_HEX[attr] || '#6b7280'}
              <span class="inline-flex items-center gap-1 mr-1 mb-1 px-1.5 py-0.5 text-[10px] rounded border" style="border-color:{attrColor}; color:{attrColor}">
                {c.cardname || ''}<span class="text-gray-400">({c.name || ''})</span>
              </span>
            {/each}
            {#if silverCandidates.length > 30}
              <span class="text-[10px] text-gray-400">…他 {silverCandidates.length - 30}枚</span>
            {/if}
          </div>
        </div>
      </details>
    {/if}
  </div>
</section>

<section class="bg-white rounded-lg shadow p-4 mb-4">
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
    <div>
      <label for="eval-mode" class="block text-xs text-gray-500 mb-1">評価指標</label>
      <select id="eval-mode" bind:value={evalMode} class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
        <option value="expected">算術期待値（推奨）</option>
        <option value="max">理論最大値（全スキル発動）</option>
      </select>
    </div>
    <label class="flex items-center gap-2">
      <input type="checkbox" bind:checked={scoreUpAssist} class="rounded" />
      <span class="text-xs">SCOREUPアシスト（+12%）</span>
    </label>
    <label class="flex items-center gap-2 text-xs">
      <span>SCOREUPバッジ</span>
      <input type="number" bind:value={scoreUpBadgeRate} class="w-16 border border-gray-300 rounded px-2 py-1 text-sm" min="0" max="100" step="1" />
      <span>%</span>
    </label>
  </div>
  <div class="mt-3 border-t pt-3 space-y-2">
    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" bind:checked={ownedOnly} class="rounded" />
      <span><b>所持衣装で検索</b> — センター + メンバー4枚を所持枚数の範囲内で組合せ、フレンドは全候補から評価します</span>
    </label>
    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" bind:checked={shrinkPairOnly} class="rounded" />
      <span><b>判定縮小2枚以上編成</b> — 縮小スキル持ちが合計2枚以上になる編成のみ探索します。センター+メンバーの縮小が1枚以下の場合はフレンドを縮小持ちに絞り、2枚以上なら全フレンドを組合せます（縮小持ち候補 {shrinkCandidates.length} 枚）</span>
    </label>
    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" id="opt-use-owned-broachs" bind:checked={useOwnedBroachs} class="rounded" />
      <span><b>所持共通ブローチを割り当てる</b> — 登録した共通ブローチを所持数の範囲でセンター + メンバー4枠に自動割当します。フレンド枠は全種から推奨ブローチを割当（OFF はブローチなしで探索）</span>
    </label>
    {#if useOwnedBroachs && ownedBroachTotal === 0}
      <p class="text-[11px] text-amber-600 pl-6">共通ブローチが未登録のため、ブローチなしで探索します。<a class="underline" href={`${base}shared-broach/`}>共通ブローチ登録ページ</a>で所持数を登録してください。</p>
    {/if}
  </div>
</section>

<div class="space-y-2 mb-4">
  <div class="flex gap-2">
    <button
      type="button"
      class="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={searchDisabled}
      onclick={runSearch}
    >
      {searching ? '探索中…' : '🔍 総当たり探索を開始'}
    </button>
    {#if searching}
      <button type="button" class="px-4 bg-red-500 text-white py-3 rounded-lg font-bold text-sm hover:bg-red-600 transition-colors" onclick={requestAbort}>
        中断
      </button>
    {/if}
  </div>
  {#if searchDisabledReason && !searching}
    <p class="text-xs text-center text-amber-600">{searchDisabledReason}</p>
  {/if}
  {#if searching}
    <div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div class="bg-indigo-600 h-2 rounded-full transition-all" style="width: {progressPct}%"></div>
      </div>
      <p class="text-xs text-gray-500 mt-1 text-center">{progressText}</p>
    </div>
  {/if}
</div>

{#if lastResult}
  <SearchResults result={lastResult} selectedSong={selectedSong} {allCards} {allBroachs} {currentTierMap} {base} />
{/if}
