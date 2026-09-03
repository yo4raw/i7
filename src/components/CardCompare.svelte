<script lang="ts">
  import { onMount } from 'svelte';
  import type { Card } from '../lib/data/fetchCardsJson';
  import { fetchCardsJson } from '../lib/data/fetchCardsJson';
  import type { Song } from '../lib/data/fetchSongsJson';
  import { fetchSongsJson, filterValidSongs, firstEventSongId } from '../lib/data/fetchSongsJson';
  import SongSelect from './SongSelect.svelte';
  import type { FixedBroach } from '../lib/data/fetchFixedBroachsJson';
  import { fetchFixedBroachsJson } from '../lib/data/fetchFixedBroachsJson';
  import { refreshData } from '../lib/data/clientRefresh';
  import { attrDonutSvg } from '../lib/donutChart';
  import {
    buildTierMapForEvent, EVENT_BONUS_MULTIPLIER, isHighScoreEvent, isEventLive,
    type EventBonusTier, type EventForBonus,
  } from '../lib/data/eventBonusTiers';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';
  import {
    buildCardStrengthEntry, classifyCard, compareShrinkBy, compareScoreUpBy,
    type CardStrengthEntry, type ShrinkSortKey, type ScoreUpSortKey,
  } from '../lib/score/cardStrength';
  import ScoreUpChart from './compare/ScoreUpChart.svelte';
  import ShrinkChart from './compare/ShrinkChart.svelte';
  import CompareDetailPanel from './compare/CompareDetailPanel.svelte';

  type CompareEvent = EventForBonus & { eventname: string; eventtype: string };
  type Props = {
    cards: Card[];
    songs: Song[];
    broachs: FixedBroach[];
    events: CompareEvent[];
    base: string;
  };
  let { cards: initialCards, songs: initialSongs, broachs: initialBroachs, events }: Props = $props();

  let allCardsState = $state<Card[]>(initialCards);
  let allSongsState = $state<Song[]>(initialSongs);
  let allBroachsState = $state<FixedBroach[]>(initialBroachs);

  // ハイスコアイベントを新しい順に。開催中があれば既定選択。
  const highScoreEvents = [...events]
    .filter((e) => isHighScoreEvent(e.eventtype))
    .toSorted((a, b) => b.start_date.localeCompare(a.start_date));
  const defaultEventId =
    highScoreEvents.find((e) => isEventLive(e.start_date, e.end_date))?.id ?? null;

  let ownedIds = $state<Set<string>>(new Set());
  let hasOwned = $state(false);
  let ownedOnly = $state(false);
  let selectedEventId = $state<number | null>(defaultEventId);
  let mounted = $state(false);
  let tab = $state<'scoreUp' | 'shrink'>('scoreUp');
  let scoreUpSort = $state<ScoreUpSortKey>('expected');
  let shrinkSort = $state<ShrinkSortKey>('attr');
  let selectedSongId = $state<number | null>(null);
  let selectedIds = $state<number[]>([]);

  onMount(() => {
    const counts = loadJson<Record<string, number>>(STORAGE_KEYS.CARD_COUNTS, {});
    ownedIds = new Set(Object.keys(counts).filter((k) => counts[k] > 0));
    hasOwned = ownedIds.size > 0;
    ownedOnly = hasOwned;

    const savedEventId = loadJson<number | null>(STORAGE_KEYS.COMPARE_EVENT_ID, null);
    if (savedEventId !== null && savedEventId !== undefined && highScoreEvents.some((e) => e.id === savedEventId)) {
      selectedEventId = savedEventId;
    }
    mounted = true;

    refreshData('cards', fetchCardsJson, (fresh) => {
      allCardsState = fresh as Card[];
    });
    refreshData('songs', async () => filterValidSongs(await fetchSongsJson()), (fresh) => {
      allSongsState = fresh as Song[];
    });
    refreshData('broachs', fetchFixedBroachsJson, (fresh) => {
      allBroachsState = fresh as FixedBroach[];
    });
  });

  // 初期選択曲: イベント対象楽曲の先頭。無ければ先頭の曲
  $effect(() => {
    if ((selectedSongId !== null && selectedSongId !== undefined) || allSongsState.length === 0) return;
    selectedSongId = firstEventSongId(allSongsState) ?? allSongsState[0]?.id ?? null;
  });

  const selectedSong = $derived(allSongsState.find((s) => s.id === selectedSongId) ?? null);
  const songChartSvg = $derived(selectedSong
    ? attrDonutSvg(
        selectedSong.shout_ratio || 0, selectedSong.beat_ratio || 0, selectedSong.melody_ratio || 0,
        { sizeClass: 'size-10 flex-shrink-0' },
      )
    : '');
  const urCards = $derived(allCardsState.filter((c) => c.rarity === 'UR'));
  const visibleCards = $derived(urCards.filter((c) => !ownedOnly || ownedIds.has(String(c.ID))));

  // 選択中イベントを localStorage に保持
  $effect(() => {
    if (!mounted) return;
    saveJson(STORAGE_KEYS.COMPARE_EVENT_ID, selectedEventId);
  });

  const selectedEvent = $derived(
    selectedEventId === null || selectedEventId === undefined ? null : highScoreEvents.find((e) => e.id === selectedEventId) ?? null,
  );
  const tierMap = $derived(
    selectedEvent ? buildTierMapForEvent(selectedEvent) : new Map<number, EventBonusTier>(),
  );

  function tierFor(card: Card): EventBonusTier {
    if (!selectedEvent || card.ID === null || card.ID === undefined) return 'none';
    return tierMap.get(card.ID) ?? 'none';
  }

  const entries = $derived.by(() => {
    const song = selectedSong;
    if (!song) return [] as CardStrengthEntry[];
    return visibleCards.map((c) =>
      buildCardStrengthEntry(c, allBroachsState, song, EVENT_BONUS_MULTIPLIER[tierFor(c)]),
    );
  });

  const scoreUpEntries = $derived(
    entries.filter((e) => classifyCard(e.card) === 'scoreUp').toSorted(compareScoreUpBy(scoreUpSort)),
  );
  const shrinkEntries = $derived(
    entries.filter((e) => classifyCard(e.card) === 'shrink').toSorted(compareShrinkBy(shrinkSort)),
  );

  const selectedEntries = $derived(
    selectedIds
      .map((id) => entries.find((e) => e.card.ID === id))
      .filter((e): e is CardStrengthEntry => !!e),
  );

  function toggleSelect(entry: CardStrengthEntry) {
    const id = entry.card.ID;
    if (id === null || id === undefined) return;
    if (selectedIds.includes(id)) {
      selectedIds = selectedIds.filter((x) => x !== id);
    } else if (selectedIds.length < 4) {
      selectedIds = [...selectedIds, id];
    }
  }

  function handleSongChange() {
    selectedIds = [];
  }

  const tierOf = (entry: CardStrengthEntry) => tierFor(entry.card);
</script>

<div class="bg-white border border-gray-200 rounded-lg p-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
  <label class="flex items-center gap-2">
    <span class="text-gray-600 shrink-0">楽曲</span>
    <SongSelect
      songs={allSongsState}
      bind:value={selectedSongId}
      onChange={handleSongChange}
      class="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white max-w-72 focus:outline-none focus:ring-2 focus:ring-chrome-ink"
      placeholder={null}
    />
    {#if selectedSong}{@html songChartSvg}{/if}
  </label>
  <label class="flex items-center gap-1.5 cursor-pointer">
    <input type="checkbox" bind:checked={ownedOnly} disabled={!hasOwned} class="accent-chrome-ink" />
    <span class="text-gray-700" class:opacity-50={!hasOwned}>所持のみ</span>
  </label>
  {#if highScoreEvents.length > 0}
    <label class="flex items-center gap-2">
      <span class="text-gray-600 shrink-0">特効</span>
      <select
        aria-label="特効イベント"
        class="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white max-w-72 focus:outline-none focus:ring-2 focus:ring-chrome-ink"
        value={selectedEventId == null ? '' : String(selectedEventId)}
        onchange={(e) => {
          const v = e.currentTarget.value;
          selectedEventId = v === '' ? null : Number(v);
        }}
      >
        <option value="">特効なし</option>
        {#each highScoreEvents as ev (ev.id)}
          <option value={String(ev.id)}>{ev.eventname}</option>
        {/each}
      </select>
    </label>
  {/if}
  {#if !hasOwned}
    <span class="text-xs text-gray-400">所持衣装の登録がないため全件表示しています</span>
  {/if}
</div>

<div class="flex" role="tablist">
  <button
    type="button"
    role="tab"
    aria-selected={tab === 'scoreUp'}
    class="px-5 py-2 text-sm rounded-t-lg border border-b-0 cursor-pointer {tab === 'scoreUp'
      ? 'bg-white text-gray-900 font-bold border-gray-200'
      : 'bg-gray-100 text-gray-500 border-transparent'}"
    onclick={() => (tab = 'scoreUp')}
  >スコアアップ</button>
  <button
    type="button"
    role="tab"
    aria-selected={tab === 'shrink'}
    class="px-5 py-2 text-sm rounded-t-lg border border-b-0 cursor-pointer {tab === 'shrink'
      ? 'bg-white text-gray-900 font-bold border-gray-200'
      : 'bg-gray-100 text-gray-500 border-transparent'}"
    onclick={() => (tab = 'shrink')}
  >判定縮小</button>
</div>

<div class="bg-white border border-gray-200 rounded-b-lg rounded-tr-lg" class:pb-[600px]={selectedEntries.length > 0}>
  {#if !selectedSong}
    <p class="text-sm text-gray-500 py-10 text-center">楽曲データを読み込んでいます…</p>
  {:else if tab === 'scoreUp'}
    <div class="flex items-center gap-2 px-3 pt-3 text-sm">
      <span class="text-gray-600 shrink-0">並び替え</span>
      <select
        class="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-chrome-ink"
        bind:value={scoreUpSort}
        aria-label="スコアアップソート"
      >
        <option value="expected">期待スコア合計</option>
        <option value="max">最大スコア合計</option>
      </select>
    </div>
    <ScoreUpChart entries={scoreUpEntries} selectedIds={selectedIds} tierOf={tierOf} onToggle={toggleSelect} sortKey={scoreUpSort} />
  {:else}
    <div class="flex items-center gap-2 px-3 pt-3 text-sm">
      <span class="text-gray-600 shrink-0">並び替え</span>
      <select
        class="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-chrome-ink"
        bind:value={shrinkSort}
        aria-label="縮小ソート"
      >
        <option value="attr">属性値由来スコア</option>
        <option value="expected">期待カバー率</option>
        <option value="max">最大カバー率</option>
      </select>
    </div>
    <ShrinkChart
      entries={shrinkEntries}
      selectedIds={selectedIds}
      tierOf={tierOf}
      onToggle={toggleSelect}
      sortKey={shrinkSort}
      songDuration={selectedSong.duration || 0}
    />
  {/if}
  {#if selectedSong}
    <p class="text-[11px] text-amber-600 px-3 pb-3">
      グループ限定・全属性編成が条件の固有ブローチは、条件を満たしたものとして加算しています。実際のゲームでは編成しだいで発動しません。前提は衣装を選ぶと詳細パネルの「ブローチ前提」欄に表示されます。
    </p>
  {/if}
</div>

{#if selectedEntries.length > 0}
  <CompareDetailPanel
    entries={selectedEntries}
    onRemove={toggleSelect}
    onClear={() => (selectedIds = [])}
    songDuration={selectedSong?.duration || 0}
  />
{/if}
