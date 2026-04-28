<script lang="ts">
  import type { Card } from '../lib/data/fetchCardsJson';
  import { getApSkillLevel } from '../lib/data/fetchCardsJson';
  import { formatSkillEffect } from '../lib/score/skillFormatter';
  import type { Song } from '../lib/data/fetchSongsJson';
  import type { FixedBroach } from '../lib/data/fetchFixedBroachsJson';
  import type { ScoreOptions } from '../lib/score/types';
  import { normalizeAttribute } from '../lib/score/types';
  import { computeTeam, calcMaxScore, calcExpectedScore, flattenNotes } from '../lib/score/engine';
  import { buildLiveTierMap, isEventLive, BONUS_LABEL, BONUS_CLASS } from '../lib/data/eventBonusTiers';
  import type { EventBonusTier, EventForBonus } from '../lib/data/eventBonusTiers';
  import { ATTR_HEX, RARITY_BADGE_CLASSES, ATTR_BADGE_BG } from '../lib/constants';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';
  import { cardThumbUrl } from '../lib/ui';
  import { loadRabbitNotes } from '../lib/data/rabbitNote';
  import { refreshData } from '../lib/data/clientRefresh';
  import { fetchCardsJson } from '../lib/data/fetchCardsJson';
  import { fetchSongsJson, filterValidSongs, filterAllowedSongs } from '../lib/data/fetchSongsJson';
  import { fetchFixedBroachsJson } from '../lib/data/fetchFixedBroachsJson';

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

  type DeckRecord = {
    cardIds: (number | null)[];
    score: number;
    liveEndScore?: number;
    baseScore?: number;
    scoreUpExpected?: number;
    shrinkExpected?: number;
    finalScore?: number;
  };
  type SearchResult = {
    best: DeckRecord;
    top: DeckRecord[];
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
  let now = $state(Date.now());

  let searching = $state(false);
  let progressPct = $state(0);
  let progressText = $state('');
  let lastResult = $state<SearchResult | null>(null);
  let abortRequested = false;

  $effect(() => {
    const id = setInterval(() => { now = Date.now(); }, 60_000);
    return () => clearInterval(id);
  });

  $effect(() => {
    refreshData('cards', fetchCardsJson, (fresh) => { allCards = fresh as Card[]; });
    refreshData('songs', async () => filterAllowedSongs(filterValidSongs(await fetchSongsJson())), (fresh) => { allSongs = fresh as Song[]; });
    refreshData('broachs', fetchFixedBroachsJson, (fresh) => { allBroachs = fresh as FixedBroach[]; });
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

  function binomial(n: number, k: number): number {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return r;
  }
  function multichoose(n: number, k: number): number {
    return binomial(n + k - 1, k);
  }
  const comboCount = $derived(currentCandidates.length >= 1 ? currentCandidates.length * currentCandidates.length * multichoose(currentCandidates.length, 4) : 0);

  const searchDisabled = $derived(!selectedSong || currentCandidates.length < 1 || searching);
  const searchDisabledReason = $derived(
    !selectedSong ? '楽曲を選択してください'
      : currentCandidates.length < 1 ? '開催中イベントに金/銀特効 UR カードがありません'
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

  function* multisetIndices(N: number, k: number): Generator<number[]> {
    if (N <= 0 || k <= 0) return;
    const idx = new Array(k).fill(0);
    while (true) {
      yield idx;
      let i = k - 1;
      while (i >= 0 && idx[i] === N - 1) i--;
      if (i < 0) break;
      const v = idx[i] + 1;
      for (let j = i; j < k; j++) idx[j] = v;
    }
  }

  function formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(2)} 秒`;
    const m = Math.floor(s / 60);
    return `${m}分 ${(s - m * 60).toFixed(1)}秒`;
  }

  async function runSearch() {
    if (!selectedSong || currentCandidates.length < 1) return;

    const totalEvals = comboCount;
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

    const scoreOptions: ScoreOptions = {
      scoreUpAssist,
      scoreUpBadgeRate,
    };

    const notes = flattenNotes(selectedSong, 42);
    const rabbit = loadRabbitNotes();
    const skillLevels: (1 | 2 | 3 | 4 | 5)[] = [5, 5, 5, 5, 5, 5];
    const trained: boolean[] = [true, true, true, true, true, true];
    const emptyShared: number[][] = [[], [], [], [], [], []];
    const notesCount = selectedSong.notes_count || notes.length;

    const TOP_K = 10;
    const top: DeckRecord[] = [];
    const pushTop = (rec: DeckRecord) => {
      if (top.length < TOP_K) {
        top.push(rec);
        top.sort((a, b) => b.score - a.score);
      } else if (rec.score > top[TOP_K - 1].score) {
        top[TOP_K - 1] = rec;
        top.sort((a, b) => b.score - a.score);
      }
    };

    const candidates = currentCandidates;
    const N = candidates.length;
    const deck: (Card | null)[] = new Array(6).fill(null);
    let evaluated = 0;
    const YIELD_EVERY = 3000;
    const t0 = performance.now();
    outer:
    for (let ci = 0; ci < N; ci++) {
      deck[0] = candidates[ci];
      for (let fi = 0; fi < N; fi++) {
        deck[5] = candidates[fi];
        for (const members of multisetIndices(N, 4)) {
          deck[1] = candidates[members[0]];
          deck[2] = candidates[members[1]];
          deck[3] = candidates[members[2]];
          deck[4] = candidates[members[3]];

          const tiers = buildTiersFromDeck(deck);
          const team = computeTeam(
            deck, allBroachs, selectedSong, tiers, trained, undefined, emptyShared, skillLevels, rabbit
          );
          let score = 0;
          const rec: DeckRecord = {
            cardIds: [deck[0]!.ID!, deck[1]!.ID!, deck[2]!.ID!, deck[3]!.ID!, deck[4]!.ID!, deck[5]!.ID!],
            score: 0,
          };
          if (evalMode === 'expected') {
            const e = calcExpectedScore(team, notes, notesCount, scoreOptions);
            score = e.finalScore;
            rec.baseScore = e.baseScore;
            rec.scoreUpExpected = e.scoreUpExpected;
            rec.shrinkExpected = e.shrinkExpected;
            rec.liveEndScore = e.liveEndScore;
            rec.finalScore = e.finalScore;
          } else {
            score = calcMaxScore(team, notes, scoreOptions);
            rec.finalScore = score;
          }
          rec.score = score;
          pushTop(rec);
          evaluated++;

          if (evaluated % YIELD_EVERY === 0) {
            const pct = Math.min(100, Math.round((evaluated / totalEvals) * 100));
            progressPct = pct;
            const speed = evaluated / ((performance.now() - t0) / 1000);
            const etaSec = Math.max(0, (totalEvals - evaluated) / Math.max(1, speed));
            progressText = `探索中… ${pct}% (${evaluated.toLocaleString()} / ${totalEvals.toLocaleString()}, 残り約 ${formatElapsed(etaSec * 1000)}, 暫定 1位: ${top[0] ? top[0].score.toLocaleString() : '-'})`;
            await new Promise<void>((r) => setTimeout(r, 0));
            if (abortRequested) break outer;
          }
        }
      }
    }

    const elapsedMs = Math.round(performance.now() - t0);

    if (top.length === 0) {
      alert('評価できる組合せがありませんでした');
    } else {
      lastResult = {
        best: top[0],
        top,
        evaluated,
        elapsedMs,
        evalMode,
        aborted: abortRequested,
      };
    }
    searching = false;
  }

  function requestAbort() {
    abortRequested = true;
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
  const bestTeam = $derived.by(() => {
    if (!lastResult || !selectedSong) return null;
    const deck = lastResult.best.cardIds.map(getCardById);
    const tiers = buildTiersFromDeck(deck);
    const skillLevels: (1 | 2 | 3 | 4 | 5)[] = [5, 5, 5, 5, 5, 5];
    const trained: boolean[] = [true, true, true, true, true, true];
    return computeTeam(deck, allBroachs, selectedSong, tiers, trained, undefined, [[], [], [], [], [], []], skillLevels, loadRabbitNotes());
  });
</script>

<section class="bg-white rounded-lg shadow p-4 mb-4">
  <label for="song-select" class="block text-xs font-bold text-gray-700 mb-2">🎵 楽曲</label>
  <select
    id="song-select"
    bind:value={selectedSongId}
    class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
  <h2 class="text-sm font-bold text-gray-700 mb-2">📅 現在開催中のイベント</h2>
  <div class="text-xs text-gray-600">
    {#if currentLiveEvents.length === 0}
      <p class="text-gray-400">現在開催中のイベントはありません。</p>
    {:else}
      <ul class="mb-2 list-disc pl-5">
        {#each currentLiveEvents as ev}
          <li class="mb-0.5"><b>{ev.eventname}</b> <span class="text-gray-400 text-[11px]">({ev.start_date} 〜 {ev.end_date} 17:00)</span></li>
        {/each}
      </ul>
      <div class="mb-2">
        <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-400 mr-1">金特効</span>
        <b>{goldCandidates.length}</b> 枚
        <span class="ml-3 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-700 border border-gray-400 mr-1">銀特効</span>
        <b>{silverCandidates.length}</b> 枚
        <span class="ml-3">候補合計 <b>{currentCandidates.length}</b> 枚 → 評価する組合せ 約 <b>{comboCount.toLocaleString()}</b> 通り</span>
      </div>
      <details class="mt-2">
        <summary class="cursor-pointer text-[11px] text-indigo-600">候補カードを展開</summary>
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
  {@const result = lastResult}
  {@const modeLabel = result.evalMode === 'expected' ? '算術期待値（最終リザルト）' : '理論最大値（全スキル発動）'}
  <section class="space-y-4">
    <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg shadow p-4 md:p-6">
      <div class="text-[10px] text-gray-500 uppercase tracking-widest text-center">理論値最大編成</div>
      <div class="text-3xl md:text-5xl font-bold text-indigo-700 text-center mt-1">{result.best.score.toLocaleString()}</div>
      <div class="text-center text-xs text-gray-500 mt-1">
        {result.aborted ? `${modeLabel} ※探索中断` : modeLabel}
      </div>
      <div class="mt-3 grid grid-cols-2 gap-4 text-center text-xs">
        <div>
          <div class="text-gray-500">評価済み組合せ</div>
          <div class="font-bold text-gray-700 text-base">{result.evaluated.toLocaleString()}</div>
        </div>
        <div>
          <div class="text-gray-500">計算時間</div>
          <div class="font-bold text-gray-700 text-base">{formatElapsed(result.elapsedMs)}</div>
        </div>
      </div>
    </div>

    <section class="bg-white rounded-lg shadow p-4">
      <h2 class="text-sm font-bold text-gray-700 mb-3">🎴 最適編成</h2>
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {#each DISPLAY_ORDER as i}
          {@const card = getCardById(result.best.cardIds[i])}
          {#if card}
            {@const attr = normalizeAttribute(card.attribute)}
            {@const attrColor = ATTR_HEX[attr] || '#6b7280'}
            {@const rarityClass = RARITY_BADGE_CLASSES[card.rarity || ''] || 'bg-gray-300'}
            {@const attrBgClass = ATTR_BADGE_BG[attr] || 'bg-gray-300'}
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
                  <span class="px-1 py-0.5 text-[9px] font-bold text-white rounded {rarityClass}">{card.rarity || '?'}</span>
                  <span class="px-1 py-0.5 text-[9px] font-bold text-white rounded {attrBgClass}">{attr}</span>
                </div>
                <div class="text-[9px] text-gray-600 text-center truncate w-full" title={card.cardname || ''}>{card.cardname || ''}</div>
                <div class="text-[8px] text-gray-400 text-center">{card.name || ''}</div>
                <div class="mt-1 text-[9px] {bonusClass}">{bonusLabel}</div>
              </div>
            </div>
          {:else}
            <div class="text-center text-gray-400">空</div>
          {/if}
        {/each}
      </div>
    </section>

    <section class="bg-white rounded-lg shadow p-4">
      <h2 class="text-sm font-bold text-gray-700 mb-3">🧾 カード詳細</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-gray-500 border-b">
              <th class="text-left py-1 px-1">スロット</th>
              <th class="text-left py-1 px-1">カード名</th>
              <th class="text-center py-1 px-1">特効</th>
              <th class="text-right py-1 px-1 text-red-500">Shout</th>
              <th class="text-right py-1 px-1 text-green-500">Beat</th>
              <th class="text-right py-1 px-1 text-blue-500">Melody</th>
              <th class="text-left py-1 px-1">スキル</th>
              <th class="text-left py-1 px-1">効果</th>
            </tr>
          </thead>
          <tbody>
            {#if bestTeam}
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
                  <tr class="border-t">
                    <td class="py-1 px-1 text-[10px] {labelColor}">{SLOT_LABELS[i]}</td>
                    <td class="py-1 px-1">
                      <div>{card.cardname || ''}</div>
                      <div class="text-[10px] text-gray-400">{card.name || ''}</div>
                    </td>
                    <td class="py-1 px-1 text-center {bonusClass}">{bonusLabel}</td>
                    <td class="py-1 px-1 text-right text-red-500">{dc.shout_max.toLocaleString()}</td>
                    <td class="py-1 px-1 text-right text-green-500">{dc.beat_max.toLocaleString()}</td>
                    <td class="py-1 px-1 text-right text-blue-500">{dc.melody_max.toLocaleString()}</td>
                    <td class="py-1 px-1">{card.ap_skill_type || '-'}</td>
                    <td class="py-1 px-1">{skillEffect}</td>
                  </tr>
                {/if}
              {/each}
              <tr class="border-t-2 font-bold text-xs">
                <td colspan="3" class="py-1 px-1 text-right">チーム合計</td>
                <td class="py-1 px-1 text-right text-red-500">{bestTeam.Shout.toLocaleString()}</td>
                <td class="py-1 px-1 text-right text-green-500">{bestTeam.Beat.toLocaleString()}</td>
                <td class="py-1 px-1 text-right text-blue-500">{bestTeam.Melody.toLocaleString()}</td>
                <td colspan="2"></td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    </section>

    <section class="bg-white rounded-lg shadow p-4">
      <h2 class="text-sm font-bold text-gray-700 mb-3">📊 スコア内訳</h2>
      <table class="w-full text-sm">
        <tbody>
          {#if result.best.baseScore != null}
            <tr><td class="text-gray-500 py-1">属性値による楽曲スコア</td><td class="text-right py-1">{result.best.baseScore.toLocaleString()}</td></tr>
          {/if}
          {#if result.best.scoreUpExpected != null}
            <tr><td class="text-gray-500 py-1">スコアアップ期待値</td><td class="text-right py-1">{result.best.scoreUpExpected.toLocaleString()}</td></tr>
          {/if}
          {#if result.best.shrinkExpected != null}
            <tr><td class="text-gray-500 py-1">判定縮小期待値</td><td class="text-right py-1">{result.best.shrinkExpected.toLocaleString()}</td></tr>
          {/if}
          {#if result.best.liveEndScore != null}
            <tr class="border-t"><td class="text-gray-500 py-1">ライブ終了時スコア</td><td class="text-right py-1">{result.best.liveEndScore.toLocaleString()}</td></tr>
          {/if}
          <tr><td class="text-gray-500 py-1 font-bold">最終リザルト</td><td class="text-right py-1 font-bold">{result.best.score.toLocaleString()}</td></tr>
        </tbody>
      </table>
    </section>

    <section class="bg-white rounded-lg shadow p-4">
      <h2 class="text-sm font-bold text-gray-700 mb-3">🏅 上位候補 TOP 10</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-gray-500 border-b">
              <th class="text-left py-1 px-1">#</th>
              <th class="text-right py-1 px-1">スコア</th>
              <th class="text-left py-1 px-1">編成（センター → メンバー → フレンド）</th>
            </tr>
          </thead>
          <tbody>
            {#each result.top as rec, rank}
              <tr class="border-t">
                <td class="py-1 px-1">{rank + 1}</td>
                <td class="py-1 px-1 text-right font-bold">{rec.score.toLocaleString()}</td>
                <td class="py-1 px-1">
                  {#each rec.cardIds as cid, slot}
                    {@const card = getCardById(cid)}
                    {#if card}
                      {@const attr = normalizeAttribute(card.attribute)}
                      {@const attrColor = ATTR_HEX[attr] || '#6b7280'}
                      {@const tier = currentTierMap.get(card.ID!) ?? 'none'}
                      {@const tierMark = tier === 'gold' ? '🥇' : tier === 'silver' ? '🥈' : ''}
                      {@const label = slot === 0 ? '★' : slot === 5 ? '✦' : ''}
                      <span class="inline-block mr-1 mb-0.5 text-[10px]" style="color:{attrColor}">{label}{tierMark}{card.cardname || ''}</span>
                    {/if}
                  {/each}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <div class="text-center">
      <button type="button" class="text-xs text-indigo-600 hover:underline" onclick={sendToScoreCalc}>
        この編成をスコア計算ページに送る →
      </button>
    </div>
  </section>
{/if}
