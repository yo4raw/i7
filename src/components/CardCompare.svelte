<script lang="ts">
  import { onMount } from 'svelte';
  import type { Card } from '../lib/data/fetchCardsJson';
  import { fetchCardsJson } from '../lib/data/fetchCardsJson';
  import type { Song } from '../lib/data/fetchSongsJson';
  import { fetchSongsJson, filterAllowedSongs, filterValidSongs } from '../lib/data/fetchSongsJson';
  import type { FixedBroach } from '../lib/data/fetchFixedBroachsJson';
  import { fetchFixedBroachsJson } from '../lib/data/fetchFixedBroachsJson';
  import { refreshData } from '../lib/data/clientRefresh';
  import {
    buildLiveTierMap, EVENT_BONUS_MULTIPLIER, type EventBonusTier, type EventForBonus,
  } from '../lib/data/eventBonusTiers';
  import { STORAGE_KEYS, loadJson } from '../lib/storage';
  import {
    buildCardStrengthEntry, classifyCard, compareShrink, type CardStrengthEntry,
  } from '../lib/score/cardStrength';
  import ScoreUpChart from './compare/ScoreUpChart.svelte';
  import ShrinkChart from './compare/ShrinkChart.svelte';
  import CompareDetailPanel from './compare/CompareDetailPanel.svelte';

  type Props = {
    cards: Card[];
    songs: Song[];
    broachs: FixedBroach[];
    events: EventForBonus[];
    base: string;
  };
  let { cards: initialCards, songs: initialSongs, broachs: initialBroachs, events }: Props = $props();

  const DEFAULT_SONG_NAME = 'DIAMOND FUSION';

  let allCardsState = $state<Card[]>(initialCards);
  let allSongsState = $state<Song[]>(initialSongs);
  let allBroachsState = $state<FixedBroach[]>(initialBroachs);

  const tierMap = buildLiveTierMap(events);
  const hasLiveEvent = tierMap.size > 0;

  let ownedIds = $state<Set<string>>(new Set());
  let hasOwned = $state(false);
  let ownedOnly = $state(false);
  let applyBonus = $state(false);
  let tab = $state<'scoreUp' | 'shrink'>('scoreUp');
  let selectedSongId = $state<number | null>(null);
  let selectedIds = $state<number[]>([]);

  onMount(() => {
    const counts = loadJson<Record<string, number>>(STORAGE_KEYS.CARD_COUNTS, {});
    ownedIds = new Set(Object.keys(counts).filter((k) => counts[k] > 0));
    hasOwned = ownedIds.size > 0;
    ownedOnly = hasOwned;

    refreshData('cards', fetchCardsJson, (fresh) => {
      allCardsState = fresh as Card[];
    });
    refreshData('songs', async () => filterAllowedSongs(filterValidSongs(await fetchSongsJson())), (fresh) => {
      allSongsState = fresh as Song[];
    });
    refreshData('broachs', fetchFixedBroachsJson, (fresh) => {
      allBroachsState = fresh as FixedBroach[];
    });
  });

  // 初期選択曲: DIAMOND FUSION のうちノーツ数最大の難易度。見つからなければ先頭の曲
  $effect(() => {
    if (selectedSongId != null || allSongsState.length === 0) return;
    const candidates = allSongsState.filter((s) => s.song_name === DEFAULT_SONG_NAME);
    const pool = candidates.length > 0 ? candidates : allSongsState;
    const sorted = [...pool].sort((a, b) => (b.notes_count || 0) - (a.notes_count || 0));
    selectedSongId = sorted[0]?.id ?? null;
  });

  const selectedSong = $derived(allSongsState.find((s) => s.id === selectedSongId) ?? null);
  const urCards = $derived(allCardsState.filter((c) => c.rarity === 'UR'));
  const visibleCards = $derived(urCards.filter((c) => !ownedOnly || ownedIds.has(String(c.ID))));

  function tierFor(card: Card): EventBonusTier {
    if (!applyBonus || card.ID == null) return 'none';
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
    [...entries.filter((e) => classifyCard(e.card) === 'scoreUp')].sort((a, b) => b.totalScore - a.totalScore),
  );
  const shrinkEntries = $derived(
    [...entries.filter((e) => classifyCard(e.card) === 'shrink')].sort(compareShrink),
  );

  const selectedEntries = $derived(
    selectedIds
      .map((id) => entries.find((e) => e.card.ID === id))
      .filter((e): e is CardStrengthEntry => !!e),
  );

  function toggleSelect(entry: CardStrengthEntry) {
    const id = entry.card.ID;
    if (id == null) return;
    if (selectedIds.includes(id)) {
      selectedIds = selectedIds.filter((x) => x !== id);
    } else if (selectedIds.length < 4) {
      selectedIds = [...selectedIds, id];
    }
  }

  function handleSongChange(e: Event) {
    const v = Number((e.currentTarget as HTMLSelectElement).value);
    selectedSongId = Number.isNaN(v) ? null : v;
    selectedIds = [];
  }

  const tierOf = (entry: CardStrengthEntry) => tierFor(entry.card);
</script>

<div class="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
  <label class="flex items-center gap-2">
    <span class="text-gray-600 dark:text-slate-300 shrink-0">楽曲</span>
    <select
      class="border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 max-w-72 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      value={selectedSongId != null ? String(selectedSongId) : ''}
      onchange={handleSongChange}
    >
      {#each allSongsState as s (s.id)}
        <option value={String(s.id)}>{s.song_name} ({s.difficulty || ''}) - {s.duration || '?'}秒 / {s.notes_count || '?'}ノーツ</option>
      {/each}
    </select>
  </label>
  <label class="flex items-center gap-1.5 cursor-pointer">
    <input type="checkbox" bind:checked={ownedOnly} disabled={!hasOwned} class="accent-indigo-600" />
    <span class="text-gray-700 dark:text-slate-200" class:opacity-50={!hasOwned}>所持のみ</span>
  </label>
  {#if hasLiveEvent}
    <label class="flex items-center gap-1.5 cursor-pointer">
      <input type="checkbox" bind:checked={applyBonus} class="accent-indigo-600" />
      <span class="text-gray-700 dark:text-slate-200">イベント特効を反映</span>
    </label>
  {/if}
  {#if !hasOwned}
    <span class="text-xs text-gray-400 dark:text-slate-500">所持衣装の登録がないため全件表示しています</span>
  {/if}
</div>

<div class="flex" role="tablist">
  <button
    type="button"
    role="tab"
    aria-selected={tab === 'scoreUp'}
    class="px-5 py-2 text-sm rounded-t-lg border border-b-0 cursor-pointer {tab === 'scoreUp'
      ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 font-bold border-gray-200 dark:border-slate-700'
      : 'bg-gray-100 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border-transparent'}"
    onclick={() => (tab = 'scoreUp')}
  >スコアアップ</button>
  <button
    type="button"
    role="tab"
    aria-selected={tab === 'shrink'}
    class="px-5 py-2 text-sm rounded-t-lg border border-b-0 cursor-pointer {tab === 'shrink'
      ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 font-bold border-gray-200 dark:border-slate-700'
      : 'bg-gray-100 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border-transparent'}"
    onclick={() => (tab = 'shrink')}
  >判定縮小</button>
</div>

<div class="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-b-lg rounded-tr-lg" class:pb-24={selectedEntries.length > 0}>
  {#if !selectedSong}
    <p class="text-sm text-gray-500 dark:text-slate-400 py-10 text-center">楽曲データを読み込んでいます…</p>
  {:else if tab === 'scoreUp'}
    <ScoreUpChart entries={scoreUpEntries} selectedIds={selectedIds} tierOf={tierOf} onToggle={toggleSelect} />
  {:else}
    <ShrinkChart entries={shrinkEntries} selectedIds={selectedIds} tierOf={tierOf} onToggle={toggleSelect} />
  {/if}
</div>

{#if selectedEntries.length > 0}
  <CompareDetailPanel entries={selectedEntries} onRemove={toggleSelect} onClear={() => (selectedIds = [])} />
{/if}
