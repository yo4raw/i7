<script lang="ts">
  import type { Card } from '../lib/data/fetchCardsJson';
  import { getApSkillLevel } from '../lib/data/fetchCardsJson';
  import { formatSkillEffect } from '../lib/score/skillFormatter';
  import type { Song } from '../lib/data/fetchSongsJson';
  import type { FixedBroach } from '../lib/data/fetchFixedBroachsJson';
  import { normalizeAttribute } from '../lib/score/types';
  import { computeTeam } from '../lib/score/engine';
  import {
    countCombos,
    createSearchContext,
    generateChunks,
    mergeTopK,
    evaluateFriendSwap,
    isShrinkCard,
    TOP_K,
    type DeckRecord,
    type FriendCandidate,
    type SearchInput,
    type FinderWorkerResponse,
  } from '../lib/score/maxScoreFinder';
  import { resolveDeckBroachs } from '../lib/score/broachResolver';
  import { buildLiveTierMap, isEventLive, BONUS_LABEL, BONUS_CLASS } from '../lib/data/eventBonusTiers';
  import type { EventBonusTier, EventForBonus } from '../lib/data/eventBonusTiers';
  import { ATTR_HEX } from '../lib/constants';
  import RarityBadge from './ui/RarityBadge.svelte';
  import AttributeBadge from './ui/AttributeBadge.svelte';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';
  import { cardThumbUrl } from '../lib/ui';
  import { loadRabbitNotes } from '../lib/data/rabbitNote';
  import { refreshData } from '../lib/data/clientRefresh';
  import { fetchCardsJson } from '../lib/data/fetchCardsJson';
  import { fetchSongsJson, filterValidSongs, filterAllowedSongs } from '../lib/data/fetchSongsJson';
  import { fetchFixedBroachsJson } from '../lib/data/fetchFixedBroachsJson';
  import { allCounts, reloadFromStorage as reloadCardCounts } from '../lib/stores/cardCounts.svelte';

  type LiveEvent = EventForBonus & { eventname: string };

  type Props = {
    cards: Card[];
    songs: Song[];
    broachs: FixedBroach[];
    events: LiveEvent[];
    base: string;
  };

  let { cards: initialCards, songs: initialSongs, broachs: initialBroachs, events: initialEvents, base }: Props = $props();

  const SLOT_LABELS = ['センター', 'メンバー1', 'メンバー2', 'メンバー3', 'メンバー4', 'フレンド'];
  const DISPLAY_ORDER = [1, 2, 0, 3, 4, 5];

  type SearchResult = {
    best: DeckRecord;
    top: DeckRecord[];
    topFriends: FriendCandidate[];
    evaluated: number;
    elapsedMs: number;
    evalMode: 'expected' | 'max';
    aborted?: boolean;
  };

  let allCards = $state<Card[]>(initialCards);
  let allSongs = $state<Song[]>(initialSongs);
  let allBroachs = $state<FixedBroach[]>(initialBroachs);
  const allEventsData = initialEvents;

  let selectedSongId = $state<number | ''>('');
  let evalMode = $state<'expected' | 'max'>('expected');
  let scoreUpAssist = $state(false);
  let scoreUpBadgeRate = $state(0);
  let ownedOnly = $state(false);
  let shrinkPairOnly = $state(false);

  let now = $state(Date.now());

  let searching = $state(false);
  let progressPct = $state(0);
  let progressText = $state('');
  let lastResult = $state<SearchResult | null>(null);
  let abortRequested = false;
  let activeWorkers: Worker[] = [];

  $effect(() => {
    const id = setInterval(() => { now = Date.now(); }, 60_000);
    return () => clearInterval(id);
  });

  // アイランド破棄時に探索中の Worker を解放する (フルページ遷移では不要だが将来の SPA 化への保険)
  $effect(() => {
    return () => {
      for (const w of activeWorkers) w.terminate();
      activeWorkers = [];
    };
  });

  $effect(() => {
    refreshData('cards', fetchCardsJson, (fresh) => { allCards = fresh as Card[]; });
    refreshData('songs', async () => filterAllowedSongs(filterValidSongs(await fetchSongsJson())), (fresh) => { allSongs = fresh as Song[]; });
    refreshData('broachs', fetchFixedBroachsJson, (fresh) => { allBroachs = fresh as FixedBroach[]; });
    reloadCardCounts();
  });

  const selectedSong = $derived(selectedSongId ? allSongs.find((s) => s.id === selectedSongId) ?? null : null);

  const currentLiveEvents = $derived(allEventsData.filter((ev) => isEventLive(ev.start_date, ev.end_date, now)));
  const currentTierMap = $derived(buildLiveTierMap(currentLiveEvents, now));
  const currentCandidates = $derived.by(() => {
    const goldSilverIds = new Set<number>();
    for (const ev of currentLiveEvents) {
      for (const id of ev.gold) goldSilverIds.add(id);
      for (const id of ev.silver) goldSilverIds.add(id);
    }
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
   * $state プロキシは postMessage (structured clone) できないため
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
      : currentCandidates.length < 1 ? '開催中イベントに金/銀特効 UR 衣装がありません'
      : ownedOnly && ownedCandidates.length < 1 ? '所持している金/銀特効 UR 衣装がありません'
      : ownedOnly && comboCount === 0 && !shrinkPairOnly ? '所持枚数の合計が 5 枚（センター+メンバー4枚分）に満たないため組合せがありません'
      : shrinkPairOnly && comboCount === 0 ? '判定縮小2枚編成の条件を満たす組合せが作れません（縮小持ち特効候補の不足など）'
      : ownedOnly && comboCount === 0 ? '所持枚数の合計が 5 枚（センター+メンバー4枚分）に満たないため組合せがありません'
      : ''
  );

  const pickedSongIds = $derived<Set<number>>(new Set(loadJson<number[]>(STORAGE_KEYS.SELECTED_SONGS, [])));
  const pickedSongs = $derived(
    allSongs.filter((s) => s.id != null && pickedSongIds.has(s.id)).sort((a, b) => (a.duration || 0) - (b.duration || 0))
  );
  const categorizedSongs = $derived.by(() => {
    const groups = new Map<string, Song[]>();
    for (const s of allSongs) {
      const cat = s.category || 'その他';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(s);
    }
    return [...groups.entries()];
  });

  function buildTiersFromDeck(deck: (Card | null)[]): EventBonusTier[] {
    return deck.map((c) => (c && c.ID != null ? currentTierMap.get(c.ID) ?? 'none' : 'none'));
  }

  function formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(2)} 秒`;
    const m = Math.floor(s / 60);
    return `${m}分 ${(s - m * 60).toFixed(1)}秒`;
  }

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
    let evaluated = 0;
    let provisionalBest: number | null = null;
    const localTops: DeckRecord[][] = [];
    let anyAborted = false;
    const workers: Worker[] = [];
    activeWorkers = workers; // requestAbort から abort メッセージを送るため探索中のみ共有

    const updateProgress = () => {
      const pct = Math.min(100, Math.round((evaluated / Math.max(1, totalEvals)) * 100));
      progressPct = pct;
      const speed = evaluated / ((performance.now() - t0) / 1000);
      const etaSec = Math.max(0, (totalEvals - evaluated) / Math.max(1, speed));
      progressText = `探索中… ${pct}%（${workerCount}並列, ${evaluated.toLocaleString()} / ${totalEvals.toLocaleString()}, 残り約 ${formatElapsed(etaSec * 1000)}, 暫定 1位: ${provisionalBest != null ? provisionalBest.toLocaleString() : '-'}）`;
    };

    try {
      await new Promise<void>((resolve, reject) => {
        if (chunks.length === 0) { resolve(); return; }
        let nextChunk = 0;
        let active = 0;

        const dispatch = (w: Worker) => {
          if (abortRequested || nextChunk >= chunks.length) {
            if (active === 0) resolve();
            return;
          }
          active++;
          w.postMessage({ type: 'chunk', descriptor: chunks[nextChunk++] });
        };

        for (let i = 0; i < workerCount; i++) {
          const w = new Worker(
            new URL('../lib/score/maxScoreFinder.worker.ts', import.meta.url),
            { type: 'module' },
          );
          workers.push(w);
          w.onerror = (e) => reject(new Error(`探索 Worker でエラーが発生しました: ${e.message}`));
          w.onmessage = (e: MessageEvent<FinderWorkerResponse>) => {
            const msg = e.data;
            if (msg.type === 'ready') {
              dispatch(w);
              return;
            }
            if (msg.type === 'progress') {
              evaluated += msg.evaluatedDelta;
              if (msg.localBestScore != null && (provisionalBest == null || msg.localBestScore > provisionalBest)) {
                provisionalBest = msg.localBestScore;
              }
              updateProgress();
              return;
            }
            if (msg.type === 'error') {
              reject(new Error(`探索 Worker でエラーが発生しました: ${msg.message}`));
              return;
            }
            // msg.type === 'result'
            localTops.push(msg.topK);
            if (msg.aborted) anyAborted = true;
            active--;
            dispatch(w);
          };
          w.postMessage({ type: 'init', input });
        }
      });

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
          aborted: abortRequested || anyAborted,
        };
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '探索中にエラーが発生しました');
    } finally {
      for (const w of workers) w.terminate();
      activeWorkers = [];
      searching = false;
    }
  }

  function requestAbort() {
    abortRequested = true;
    for (const w of activeWorkers) w.postMessage({ type: 'abort' });
  }

  function getCardById(id: number | null): Card | null {
    if (id == null) return null;
    return allCards.find((c) => c.ID === id) || null;
  }

  function sendToScoreCalc() {
    if (!lastResult || !selectedSong) return;
    const rec = lastResult.best;
    const tiers = buildTiersFromDeck(rec.cardIds.map(getCardById));
    const state = {
      songId: selectedSong.id,
      deckIds: rec.cardIds,
      bonusTiers: tiers,
      trained: [true, true, true, true, true, true],
      sharedBroachs: [[], [], [], [], [], []],
      skillLevels: [5, 5, 5, 5, 5, 5],
    };
    saveJson(STORAGE_KEYS.SCORE_CALC_STATE, state);
    window.location.href = `${base}score-calc/`;
  }

  // 詳細用の計算
  const bestContext = $derived.by(() => {
    if (!lastResult || !selectedSong) return null;
    const deck = lastResult.best.cardIds.map(getCardById);
    const tiers = buildTiersFromDeck(deck);
    const skillLevels: (1 | 2 | 3 | 4 | 5)[] = [5, 5, 5, 5, 5, 5];
    const trained: boolean[] = [true, true, true, true, true, true];
    const team = computeTeam(deck, allBroachs, selectedSong, tiers, trained, undefined, [[], [], [], [], [], []], skillLevels, loadRabbitNotes());
    const resolvedBroachs = resolveDeckBroachs(deck, allBroachs, selectedSong, undefined);
    return { team, deck, resolvedBroachs };
  });
  const bestTeam = $derived(bestContext?.team ?? null);

  type ResolvedBroachItem = NonNullable<ReturnType<NonNullable<ReturnType<typeof resolveDeckBroachs>['get']>>>[number];
  function broachLabel(rb: ResolvedBroachItem): string {
    const br = rb.broach;
    const mult = (rb.active ? rb.multiplier : 1) ?? 1;
    const stats: string[] = [];
    if (br.shout) stats.push(`S+${(br.shout * mult).toLocaleString()}`);
    if (br.beat) stats.push(`B+${(br.beat * mult).toLocaleString()}`);
    if (br.melody) stats.push(`M+${(br.melody * mult).toLocaleString()}`);
    if (br.score) stats.push(`スコア+${br.score}`);
    const statStr = stats.join('/');
    const baseLabel = br.condition
      ? `${br.condition}${statStr ? ' ' + statStr : ''}`
      : statStr || `ブローチ#${br.id ?? '?'}`;
    return br.broach_type === 5 && rb.active && mult > 1 ? `${baseLabel}（${mult}枚）` : baseLabel;
  }
</script>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
  <label for="song-select" class="block text-xs font-bold text-gray-700 dark:text-slate-200 mb-2">🎵 楽曲</label>
  <select
    id="song-select"
    bind:value={selectedSongId}
    class="w-full border border-gray-300 dark:border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
  >
    <option value="">楽曲を選択</option>
    {#if pickedSongs.length > 0}
      <optgroup label={`選択中の曲（${pickedSongs.length}曲・秒数順）`}>
        {#each pickedSongs as s}
          <option value={s.id}>{s.song_name} ({s.difficulty || ''}) - {s.duration || '?'}秒</option>
        {/each}
      </optgroup>
    {/if}
    {#each categorizedSongs as [cat, songs]}
      <optgroup label={cat}>
        {#each songs as s}
          <option value={s.id}>{s.song_name} ({s.difficulty || ''})</option>
        {/each}
      </optgroup>
    {/each}
  </select>
  {#if selectedSong}
    <div class="mt-3 text-xs text-gray-600 dark:text-slate-300">
      <div class="flex flex-wrap gap-3">
        <span><b>{selectedSong.song_name}</b></span>
        <span class="text-gray-400 dark:text-slate-500">|</span>
        <span>{selectedSong.difficulty || '-'} / {selectedSong.duration || '?'}秒 / {(selectedSong.notes_count || 0).toLocaleString()}ノーツ</span>
        <span class="text-gray-400 dark:text-slate-500">|</span>
        <span style="color:{ATTR_HEX.Shout}">Shout {Math.round((selectedSong.shout_ratio || 0) * 100)}%</span>
        <span style="color:{ATTR_HEX.Beat}">Beat {Math.round((selectedSong.beat_ratio || 0) * 100)}%</span>
        <span style="color:{ATTR_HEX.Melody}">Melody {Math.round((selectedSong.melody_ratio || 0) * 100)}%</span>
      </div>
    </div>
  {/if}
</section>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
  <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-2">📅 現在開催中のイベント</h2>
  <div class="text-xs text-gray-600 dark:text-slate-300">
    {#if currentLiveEvents.length === 0}
      <p class="text-gray-400 dark:text-slate-500">現在開催中のイベントはありません。</p>
    {:else}
      <ul class="mb-2 list-disc pl-5">
        {#each currentLiveEvents as ev}
          <li class="mb-0.5"><b>{ev.eventname}</b> <span class="text-gray-400 dark:text-slate-500 text-[11px]">({ev.start_date} 〜 {ev.end_date} 17:00)</span></li>
        {/each}
      </ul>
      <div class="mb-2">
        <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-400 mr-1">金特効</span>
        <b>{goldCandidates.length}</b> 枚{#if ownedOnly}<span class="text-gray-400 dark:text-slate-500 text-[10px]">（所持 {ownedGoldCount}）</span>{/if}
        <span class="ml-3 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 border border-gray-400 dark:border-slate-500 mr-1">銀特効</span>
        <b>{silverCandidates.length}</b> 枚{#if ownedOnly}<span class="text-gray-400 dark:text-slate-500 text-[10px]">（所持 {ownedSilverCount}）</span>{/if}
        <span class="ml-3">候補合計 <b>{currentCandidates.length}</b> 枚{#if ownedOnly}<span class="text-gray-400 dark:text-slate-500 text-[10px]">（所持 {ownedCandidates.length}）</span>{/if} → 評価する組合せ <b>{comboCount.toLocaleString()}</b> 通り</span>
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
                {c.cardname || ''}<span class="text-gray-400 dark:text-slate-500">({c.name || ''})</span>
              </span>
            {/each}
            {#if goldCandidates.length > 30}
              <span class="text-[10px] text-gray-400 dark:text-slate-500">…他 {goldCandidates.length - 30}枚</span>
            {/if}
          </div>
          <div class="mt-2 text-[11px] font-bold text-gray-500 dark:text-slate-400">銀特効（{silverCandidates.length}枚）</div>
          <div>
            {#each silverCandidates.slice(0, 30) as c}
              {@const attr = normalizeAttribute(c.attribute)}
              {@const attrColor = ATTR_HEX[attr] || '#6b7280'}
              <span class="inline-flex items-center gap-1 mr-1 mb-1 px-1.5 py-0.5 text-[10px] rounded border" style="border-color:{attrColor}; color:{attrColor}">
                {c.cardname || ''}<span class="text-gray-400 dark:text-slate-500">({c.name || ''})</span>
              </span>
            {/each}
            {#if silverCandidates.length > 30}
              <span class="text-[10px] text-gray-400 dark:text-slate-500">…他 {silverCandidates.length - 30}枚</span>
            {/if}
          </div>
        </div>
      </details>
    {/if}
  </div>
</section>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
    <div>
      <label for="eval-mode" class="block text-xs text-gray-500 dark:text-slate-400 mb-1">評価指標</label>
      <select id="eval-mode" bind:value={evalMode} class="w-full border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm">
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
      <input type="number" bind:value={scoreUpBadgeRate} class="w-16 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm" min="0" max="100" step="1" />
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
      <span><b>判定縮小2枚編成</b> — センター+メンバー4枚に縮小2枚なら非縮小フレンド、それ以外は縮小フレンドに絞って探索します。所持衣装で検索 OFF 時はフレンドを含めちょうど2枚の組合せのみ探索します（縮小持ち候補 {shrinkCandidates.length} 枚）</span>
    </label>
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
      <div class="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
        <div class="bg-indigo-600 h-2 rounded-full transition-all" style="width: {progressPct}%"></div>
      </div>
      <p class="text-xs text-gray-500 dark:text-slate-400 mt-1 text-center">{progressText}</p>
    </div>
  {/if}
</div>

{#if lastResult}
  {@const result = lastResult}
  {@const modeLabel = result.evalMode === 'expected' ? '算術期待値（最終リザルト）' : '理論最大値（全スキル発動）'}
  <section class="space-y-4">
    <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg shadow p-4 md:p-6">
      <div class="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-widest text-center">理論値最大編成</div>
      <div class="text-3xl md:text-5xl font-bold text-indigo-700 text-center mt-1">{result.best.score.toLocaleString()}</div>
      <div class="text-center text-xs text-gray-500 dark:text-slate-400 mt-1">
        {result.aborted ? `${modeLabel} ※探索中断` : modeLabel}
      </div>
      <div class="mt-3 grid grid-cols-2 gap-4 text-center text-xs">
        <div>
          <div class="text-gray-500 dark:text-slate-400">評価済み組合せ</div>
          <div class="font-bold text-gray-700 dark:text-slate-200 text-base">{result.evaluated.toLocaleString()}</div>
        </div>
        <div>
          <div class="text-gray-500 dark:text-slate-400">計算時間</div>
          <div class="font-bold text-gray-700 dark:text-slate-200 text-base">{formatElapsed(result.elapsedMs)}</div>
        </div>
      </div>
    </div>

    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
      <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-3">🎴 最適編成</h2>
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {#each DISPLAY_ORDER as i}
          {@const card = getCardById(result.best.cardIds[i])}
          {#if card}
            {@const attr = normalizeAttribute(card.attribute)}
            {@const attrColor = ATTR_HEX[attr] || '#6b7280'}
            {@const tier = currentTierMap.get(card.ID!) ?? 'none'}
            {@const bonusLabel = BONUS_LABEL[tier]}
            {@const bonusClass = BONUS_CLASS[tier]}
            {@const slotLabel = SLOT_LABELS[i]}
            {@const labelColor = i === 0 ? 'text-indigo-600' : i === 5 ? 'text-amber-600' : 'text-gray-500'}
            <div>
              <div class="text-[10px] text-center {labelColor} font-bold mb-1">{slotLabel}</div>
              <div class="border-2 rounded-lg p-1.5 flex flex-col items-center min-h-[120px]" style="border-color:{attrColor}">
                <img src={cardThumbUrl(card.ID!)} alt={card.cardname || ''} class="w-full max-w-[60px] h-auto rounded mb-1" loading="lazy" />
                <div class="flex gap-0.5 mb-1">
                  <RarityBadge rarity={card.rarity} sizeClass="px-1 py-0.5 text-[9px]" fallbackLabel="?" />
                  <AttributeBadge attribute={attr} sizeClass="px-1 py-0.5 text-[9px]" />
                </div>
                <div class="text-[9px] text-gray-600 dark:text-slate-300 text-center truncate w-full" title={card.cardname || ''}>{card.cardname || ''}</div>
                <div class="text-[8px] text-gray-400 dark:text-slate-500 text-center">{card.name || ''}</div>
                <div class="mt-1 text-[9px] {bonusClass}">{bonusLabel}</div>
              </div>
            </div>
          {:else}
            <div class="text-center text-gray-400 dark:text-slate-500">空</div>
          {/if}
        {/each}
      </div>
    </section>

    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
      <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-3">🧾 衣装詳細</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-gray-500 dark:text-slate-400 border-b">
              <th class="text-left py-1 px-1">スロット</th>
              <th class="text-left py-1 px-1">衣装名</th>
              <th class="text-center py-1 px-1">特効</th>
              <th class="text-right py-1 px-1 text-red-500">Shout</th>
              <th class="text-right py-1 px-1 text-green-500">Beat</th>
              <th class="text-right py-1 px-1 text-blue-500">Melody</th>
              <th class="text-left py-1 px-1">スキル</th>
              <th class="text-left py-1 px-1">効果</th>
              <th class="text-left py-1 px-1">固定ブローチ</th>
            </tr>
          </thead>
          <tbody>
            {#if bestTeam && bestContext}
              {#each DISPLAY_ORDER as i}
                {@const dc = bestTeam.cards.find((x) => x.slotIndex === i)}
                {@const card = getCardById(result.best.cardIds[i])}
                {#if dc && card}
                  {@const tier = buildTiersFromDeck(result.best.cardIds.map(getCardById))[i]}
                  {@const bonusLabel = BONUS_LABEL[tier]}
                  {@const bonusClass = BONUS_CLASS[tier]}
                  {@const sl = getApSkillLevel(card, 5)}
                  {@const skillEffect = formatSkillEffect(card.ap_skill_type, card.ap_skill_req, sl)}
                  {@const labelColor = i === 0 ? 'text-indigo-600 font-bold' : i === 5 ? 'text-amber-600 font-bold' : 'text-gray-500'}
                  {@const slotBroachs = bestContext.resolvedBroachs.get(i) ?? []}
                  <tr class="border-t">
                    <td class="py-1 px-1 text-[10px] {labelColor}">{SLOT_LABELS[i]}</td>
                    <td class="py-1 px-1">
                      <div>{card.cardname || ''}</div>
                      <div class="text-[10px] text-gray-400 dark:text-slate-500">{card.name || ''}</div>
                    </td>
                    <td class="py-1 px-1 text-center {bonusClass}">{bonusLabel}</td>
                    <td class="py-1 px-1 text-right text-red-500">
                      {dc.shout_max.toLocaleString()}{#if dc.broachShout > 0}<div class="text-[9px] text-purple-600">+{dc.broachShout.toLocaleString()}</div>{/if}
                    </td>
                    <td class="py-1 px-1 text-right text-green-500">
                      {dc.beat_max.toLocaleString()}{#if dc.broachBeat > 0}<div class="text-[9px] text-purple-600">+{dc.broachBeat.toLocaleString()}</div>{/if}
                    </td>
                    <td class="py-1 px-1 text-right text-blue-500">
                      {dc.melody_max.toLocaleString()}{#if dc.broachMelody > 0}<div class="text-[9px] text-purple-600">+{dc.broachMelody.toLocaleString()}</div>{/if}
                    </td>
                    <td class="py-1 px-1">{card.ap_skill_type || '-'}</td>
                    <td class="py-1 px-1">{skillEffect}</td>
                    <td class="py-1 px-1">
                      {#if slotBroachs.length === 0}
                        <span class="text-[10px] text-gray-300 dark:text-slate-600">—</span>
                      {:else}
                        {#each slotBroachs as rb}
                          {#if rb.broach.broach_type === 8}
                            <div class="text-[9px] text-gray-400 dark:text-slate-500 line-through" title="オート専用・計算対象外">🔮 {broachLabel(rb)}</div>
                          {:else if rb.active}
                            <div class="text-[9px] text-purple-700">🔮 {broachLabel(rb)}</div>
                          {:else}
                            <div class="text-[9px] text-gray-400 dark:text-slate-500" title="条件未達">🔮 {broachLabel(rb)}</div>
                          {/if}
                        {/each}
                      {/if}
                    </td>
                  </tr>
                {/if}
              {/each}
              <tr class="border-t-2 font-bold text-xs">
                <td colspan="3" class="py-1 px-1 text-right">チーム合計（ブローチ込み）</td>
                <td class="py-1 px-1 text-right text-red-500">{bestTeam.Shout.toLocaleString()}</td>
                <td class="py-1 px-1 text-right text-green-500">{bestTeam.Beat.toLocaleString()}</td>
                <td class="py-1 px-1 text-right text-blue-500">{bestTeam.Melody.toLocaleString()}</td>
                <td colspan="3"></td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    </section>

    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
      <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-3">📊 スコア内訳</h2>
      <table class="w-full text-sm">
        <tbody>
          {#if result.best.baseScore != null}
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">属性値による楽曲スコア</td><td class="text-right py-1">{result.best.baseScore.toLocaleString()}</td></tr>
          {/if}
          {#if result.best.scoreUpExpected != null}
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">スコアアップ期待値</td><td class="text-right py-1">{result.best.scoreUpExpected.toLocaleString()}</td></tr>
          {/if}
          {#if result.best.shrinkExpected != null}
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">判定縮小期待値</td><td class="text-right py-1">{result.best.shrinkExpected.toLocaleString()}</td></tr>
          {/if}
          {#if result.best.liveEndScore != null}
            <tr class="border-t"><td class="text-gray-500 dark:text-slate-400 py-1">ライブ終了時スコア</td><td class="text-right py-1">{result.best.liveEndScore.toLocaleString()}</td></tr>
          {/if}
          {#if bestTeam && bestTeam.broachScoreBonus > 0}
            <tr><td class="text-gray-500 dark:text-slate-400 py-1">固定ブローチ スコア加算</td><td class="text-right py-1">+{bestTeam.broachScoreBonus.toLocaleString()}</td></tr>
          {/if}
          <tr><td class="text-gray-500 dark:text-slate-400 py-1 font-bold">最終リザルト</td><td class="text-right py-1 font-bold">{result.best.score.toLocaleString()}</td></tr>
        </tbody>
      </table>
    </section>

    {#if result.topFriends && result.topFriends.length > 0}
      <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
        <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-1">🤝 フレンド候補 TOP 5</h2>
        <p class="text-[11px] text-gray-500 dark:text-slate-400 mb-3">最適編成のセンター + メンバー4枚を固定し、フレンドだけ差し替えた場合のスコア（高い順）。マッチング次第で 1 位フレンドが取れない場合の代替候補です。</p>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-gray-500 dark:text-slate-400 border-b">
                <th class="text-left py-1 px-1">#</th>
                <th class="text-left py-1 px-1">衣装</th>
                <th class="text-center py-1 px-1">特効</th>
                <th class="text-right py-1 px-1">スコア</th>
              </tr>
            </thead>
            <tbody>
              {#each result.topFriends as f, rank}
                {@const card = getCardById(f.cardId)}
                {#if card}
                  {@const attr = normalizeAttribute(card.attribute)}
                  {@const attrColor = ATTR_HEX[attr] || '#6b7280'}
                  {@const tier = currentTierMap.get(card.ID!) ?? 'none'}
                  {@const bonusLabel = BONUS_LABEL[tier]}
                  {@const bonusClass = BONUS_CLASS[tier]}
                  <tr class="border-t">
                    <td class="py-1 px-1 align-middle">{rank + 1}</td>
                    <td class="py-1 px-1 align-middle">
                      <div class="flex items-center gap-2">
                        <img
                          src={cardThumbUrl(card.ID!)}
                          alt={card.cardname || ''}
                          class="w-10 h-auto rounded border flex-shrink-0"
                          style="border-color:{attrColor}"
                          loading="lazy"
                        />
                        <div class="min-w-0">
                          <div class="truncate" style="color:{attrColor}">{card.cardname || ''}</div>
                          <div class="text-[10px] text-gray-400 dark:text-slate-500 truncate">{card.name || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td class="py-1 px-1 text-center align-middle {bonusClass}">{bonusLabel}</td>
                    <td class="py-1 px-1 text-right font-bold align-middle">{f.score.toLocaleString()}</td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
      <h2 class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-1">🏅 上位候補 TOP 10</h2>
      <p class="text-[10px] text-gray-400 dark:text-slate-500 mb-3">スロット表記: ★センター / ✦フレンド / それ以外はメンバー</p>
      <div class="space-y-2">
        {#each result.top as rec, rank}
          <div class="border rounded-lg p-2 flex items-center gap-3">
            <div class="flex-shrink-0 w-8 text-center">
              <div class="text-xs text-gray-400 dark:text-slate-500">#{rank + 1}</div>
            </div>
            <div class="flex-shrink-0 text-right">
              <div class="text-sm font-bold text-indigo-700">{rec.score.toLocaleString()}</div>
            </div>
            <div class="flex-1 min-w-0 overflow-x-auto">
              <div class="flex gap-1.5">
                {#each DISPLAY_ORDER as i}
                  {@const card = getCardById(rec.cardIds[i])}
                  {#if card}
                    {@const attr = normalizeAttribute(card.attribute)}
                    {@const attrColor = ATTR_HEX[attr] || '#6b7280'}
                    {@const tier = currentTierMap.get(card.ID!) ?? 'none'}
                    {@const tierMark = tier === 'gold' ? '🥇' : tier === 'silver' ? '🥈' : ''}
                    {@const slotMark = i === 0 ? '★' : i === 5 ? '✦' : ''}
                    {@const slotColor = i === 0 ? 'text-indigo-600' : i === 5 ? 'text-amber-600' : 'text-gray-400'}
                    <div class="flex-shrink-0 flex flex-col items-center w-20" title={`${SLOT_LABELS[i]}: ${card.cardname || ''} (${card.name || ''})`}>
                      <div class="text-[10px] {slotColor} font-bold leading-none">{slotMark}{tierMark}</div>
                      <img
                        src={cardThumbUrl(card.ID!)}
                        alt={card.cardname || ''}
                        class="w-9 h-auto rounded border mt-0.5"
                        style="border-color:{attrColor}"
                        loading="lazy"
                      />
                      <div class="mt-0.5 text-[9px] leading-tight text-center w-full truncate" style="color:{attrColor}">{card.cardname || ''}</div>
                      <div class="text-[8px] leading-tight text-center w-full truncate text-gray-400 dark:text-slate-500">{card.name || ''}</div>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <div class="text-center">
      <button type="button" class="text-xs text-indigo-600 hover:underline" onclick={sendToScoreCalc}>
        この編成をスコア計算ページに送る →
      </button>
    </div>
  </section>
{/if}
