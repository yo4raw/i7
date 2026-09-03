<script lang="ts">
  import { onMount } from 'svelte';
  import type { Card } from '../lib/data/fetchCardsJson';
  import { fetchCardsJson } from '../lib/data/fetchCardsJson';
  import type { Song } from '../lib/data/fetchSongsJson';
  import { fetchSongsJson, filterValidSongs, firstEventSongId } from '../lib/data/fetchSongsJson';
  import type { FixedBroach } from '../lib/data/fetchFixedBroachsJson';
  import { fetchFixedBroachsJson } from '../lib/data/fetchFixedBroachsJson';
  import { refreshData } from '../lib/data/clientRefresh';
  import SongSelect from './SongSelect.svelte';
  import SongAttrRatio from './SongAttrRatio.svelte';
  import EventShareImage from './EventShareImage.svelte';
  import ScoreUpChart from './compare/ScoreUpChart.svelte';
  import ShrinkChart from './compare/ShrinkChart.svelte';
  import {
    buildTierMapForEvent, EVENT_BONUS_MULTIPLIER, isHighScoreEvent, isEventLive,
    type EventBonusTier, type EventForBonus,
  } from '../lib/data/eventBonusTiers';
  import {
    buildCardStrengthEntry, classifyCard, compareScoreUpBy, compareShrinkBy,
    type CardStrengthEntry,
  } from '../lib/score/cardStrength';
  import { SITE_NAME } from '../lib/constants';
  import { STORAGE_KEYS, loadJson } from '../lib/storage';

  type CompareEvent = EventForBonus & { eventname: string; eventtype: string };
  type Props = {
    cards: Card[];
    songs: Song[];
    broachs: FixedBroach[];
    events: CompareEvent[];
  };
  let { cards: initialCards, songs: initialSongs, broachs: initialBroachs, events }: Props = $props();

  /** 共有パネルに載せる上位件数 */
  const TOP_N = 10;
  /** 並び順は衣装比較の既定と揃える（スコアアップ = 期待スコア合計 / 判定縮小 = 属性値由来スコア） */
  const SCORE_UP_SORT = 'expected' as const;
  const SHRINK_SORT = 'attr' as const;

  let allCardsState = $state<Card[]>(initialCards);
  let allSongsState = $state<Song[]>(initialSongs);
  let allBroachsState = $state<FixedBroach[]>(initialBroachs);

  // ハイスコアイベントを新しい順に。開催中があれば既定選択（衣装比較と同じ規則）。
  const highScoreEvents = [...events]
    .filter((e) => isHighScoreEvent(e.eventtype))
    .toSorted((a, b) => b.start_date.localeCompare(a.start_date));
  let selectedEventId = $state<number | null>(
    highScoreEvents.find((e) => isEventLive(e.start_date, e.end_date))?.id ?? null,
  );
  let selectedSongId = $state<number | null>(null);

  onMount(() => {
    // 衣装比較で選んだ特効に揃える。共有ページ側での変更は保存しない（比較画面の選択を書き換えないため）
    const savedEventId = loadJson<number | null>(STORAGE_KEYS.COMPARE_EVENT_ID, null);
    if (savedEventId !== null && savedEventId !== undefined && highScoreEvents.some((e) => e.id === savedEventId)) {
      selectedEventId = savedEventId;
    }

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
  const selectedEvent = $derived(
    selectedEventId === null || selectedEventId === undefined
      ? null
      : highScoreEvents.find((e) => e.id === selectedEventId) ?? null,
  );
  const tierMap = $derived(
    selectedEvent ? buildTierMapForEvent(selectedEvent) : new Map<number, EventBonusTier>(),
  );

  function tierFor(card: Card): EventBonusTier {
    if (!selectedEvent || card.ID === null || card.ID === undefined) return 'none';
    return tierMap.get(card.ID) ?? 'none';
  }
  const tierOf = (entry: CardStrengthEntry) => tierFor(entry.card);

  // 所持による絞り込みはしない（共有画像は誰が見ても同じ全 UR 基準にする）
  const entries = $derived.by(() => {
    const song = selectedSong;
    if (!song) return [] as CardStrengthEntry[];
    return allCardsState
      .filter((c) => c.rarity === 'UR')
      .map((c) => buildCardStrengthEntry(c, allBroachsState, song, EVENT_BONUS_MULTIPLIER[tierFor(c)]));
  });

  const topScoreUp = $derived(
    entries.filter((e) => classifyCard(e.card) === 'scoreUp').toSorted(compareScoreUpBy(SCORE_UP_SORT)).slice(0, TOP_N),
  );
  const topShrink = $derived(
    entries.filter((e) => classifyCard(e.card) === 'shrink').toSorted(compareShrinkBy(SHRINK_SORT)).slice(0, TOP_N),
  );

  /** ダウンロード画像のファイル名（拡張子なし）。ファイル名に使えない文字を除去 */
  const shareFilename = $derived.by(() => {
    const name = (selectedSong?.song_name ?? '楽曲')
      .replaceAll(/[\\/:*?"<>|]/g, '')
      .replaceAll(/\s+/g, '_');
    const diff = selectedSong?.difficulty ? `_${selectedSong.difficulty}` : '';
    return `${name}${diff}_衣装比較Top${TOP_N}`;
  });
</script>

<div class="bg-white border border-gray-200 rounded-lg p-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
  <label class="flex items-center gap-2">
    <span class="text-gray-600 shrink-0">楽曲</span>
    <SongSelect
      songs={allSongsState}
      bind:value={selectedSongId}
      class="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white max-w-72 focus:outline-none focus:ring-2 focus:ring-chrome-ink"
      placeholder={null}
    />
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
  <EventShareImage filename={shareFilename} targetId="compare-share-panel" />
</div>

<!-- スクショ対象パネル（端末によらず同じダウンロード画像になるよう幅固定。狭い画面では横スクロール） -->
<div class="overflow-x-auto pb-2">
<div id="compare-share-panel" class="w-[1024px] shrink-0 rounded-xl border border-gray-200 shadow-lg overflow-hidden bg-white">
  {#if !selectedSong}
    <p class="text-sm text-gray-500 py-16 text-center">楽曲データを読み込んでいます…</p>
  {:else}
    <div class="bg-chrome-ink text-white px-4 py-3">
      <div class="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 class="text-lg font-bold leading-snug">
          {selectedSong.song_name}
          <span class="ml-2 text-sm font-semibold text-gray-300">{selectedSong.difficulty || ''}</span>
        </h2>
        <span class="text-xs font-semibold text-gray-300 whitespace-nowrap">{SITE_NAME}</span>
      </div>
      <div class="mt-1 text-xs text-gray-300 space-x-2">
        <span class="tabular-nums">{selectedSong.duration || '?'}秒 / {selectedSong.notes_count || '?'}ノーツ</span>
        <span>/</span>
        <span>UR 全 {entries.length} 着から Top{TOP_N}</span>
        <span>/</span>
        <span>{selectedEvent ? `特効 ${selectedEvent.eventname}` : '特効なし'}</span>
      </div>
    </div>

    <div class="px-4 py-2 border-b border-gray-200 bg-gray-50">
      <SongAttrRatio song={selectedSong} />
    </div>

    <section class="pt-3">
      <div class="flex items-center gap-2 px-3">
        <span class="inline-block px-3 py-0.5 rounded-full text-sm font-bold bg-chrome-ink text-white">スコアアップ Top{TOP_N}</span>
        <span class="text-xs text-gray-500">期待スコア合計の降順</span>
      </div>
      <ScoreUpChart entries={topScoreUp} {tierOf} sortKey={SCORE_UP_SORT} compact />
    </section>

    <section class="pt-2 border-t border-gray-200">
      <div class="flex items-center gap-2 px-3 pt-2">
        <span class="inline-block px-3 py-0.5 rounded-full text-sm font-bold bg-chrome-ink text-white">判定縮小 Top{TOP_N}</span>
        <span class="text-xs text-gray-500">属性値由来スコアの降順</span>
      </div>
      <ShrinkChart entries={topShrink} {tierOf} sortKey={SHRINK_SORT} songDuration={selectedSong.duration || 0} compact />
    </section>

    <p class="px-3 pb-3 text-[10px] leading-relaxed text-gray-500 border-t border-gray-200 pt-2">
      UR 限定 / 全ノーツ Perfect 前提 / センタースキル除外 / 固有ブローチ装備込み。
      グループ限定・全属性編成が条件の固有ブローチは条件を満たしたものとして加算しているため、編成しだいでは表示値に届きません。
      算出値は有志による計測・推定に基づくもので、ゲーム内の挙動と完全に一致することを保証するものではありません。
    </p>
  {/if}
</div>
</div>
