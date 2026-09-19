<script lang="ts">
  import { onMount } from 'svelte';
  import type { Card } from '../lib/data/fetchCardsJson';
  import { fetchCardsJson } from '../lib/data/fetchCardsJson';
  import type { Song } from '../lib/data/fetchSongsJson';
  import { fetchSongsJson, filterValidSongs } from '../lib/data/fetchSongsJson';
  import type { FixedBroach } from '../lib/data/fetchFixedBroachsJson';
  import { fetchFixedBroachsJson } from '../lib/data/fetchFixedBroachsJson';
  // 型だけを取り込む。fetchEventsCsv は node:fs を使うため実行時 import はクライアントで動かない
  import type { EventRow } from '../lib/data/fetchEventsCsv';
  import { formatEventPeriod } from '../lib/data/eventPeriod';
  import { refreshData } from '../lib/data/clientRefresh';
  import SongAttrRatio from './SongAttrRatio.svelte';
  import EventShareImage from './EventShareImage.svelte';
  import ScoreUpChart from './compare/ScoreUpChart.svelte';
  import ShrinkChart from './compare/ShrinkChart.svelte';
  import {
    buildTierMapForEvent, EVENT_BONUS_MULTIPLIER, isHighScoreEvent, type EventBonusTier,
  } from '../lib/data/eventBonusTiers';
  import {
    buildCardStrengthEntry, classifyCard, compareScoreUpBy, compareShrinkBy,
    type CardStrengthEntry,
  } from '../lib/score/cardStrength';
  import { SITE_NAME } from '../lib/constants';

  type Props = {
    event: EventRow;
    /** イベントの対象楽曲（event-songs.json の順） */
    songs: Song[];
    /** UR 全着（ビルド時に UR へ絞って埋め込む。クライアントの再取得後も UR に絞る） */
    cards: Card[];
    broachs: FixedBroach[];
    /** ダウンロード画像のファイル名（拡張子なし）。曲ごとの連番を末尾に付ける */
    shareFilename: string;
  };
  let { event, songs: initialSongs, cards: initialCards, broachs: initialBroachs, shareFilename }: Props = $props();

  /** 共有パネルに載せる上位件数 */
  const TOP_N = 10;
  /** 並び順は衣装比較の既定と揃える（スコアアップ = 期待スコア合計 / 判定縮小 = 属性値由来スコア） */
  const SCORE_UP_SORT = 'expected' as const;
  const SHRINK_SORT = 'attr' as const;

  let allCardsState = $state<Card[]>(initialCards);
  let songsState = $state<Song[]>(initialSongs);
  let allBroachsState = $state<FixedBroach[]>(initialBroachs);

  onMount(() => {
    refreshData('cards', fetchCardsJson, (fresh) => {
      allCardsState = fresh as Card[];
    });
    refreshData('songs', async () => filterValidSongs(await fetchSongsJson()), (fresh) => {
      // 対象楽曲の並びは保ったまま、曲データだけ最新へ差し替える
      const byId = new Map((fresh as Song[]).map((s) => [s.id, s]));
      songsState = initialSongs.map((s) => byId.get(s.id) ?? s);
    });
    refreshData('broachs', fetchFixedBroachsJson, (fresh) => {
      allBroachsState = fresh as FixedBroach[];
    });
  });

  // 特効はこのイベント自身。ハイスコアイベント以外は特効なしで計算する（衣装比較の特効セレクトと同じ規則）
  const hasBonus = isHighScoreEvent(event.eventtype);
  const tierMap = hasBonus
    ? buildTierMapForEvent({ gold: event.gold.cardIds, silver: event.silver.cardIds, bronze: event.bronze.cardIds })
    : new Map<number, EventBonusTier>();
  const tierFor = (card: Card): EventBonusTier => (card.ID === null ? 'none' : tierMap.get(card.ID) ?? 'none');
  const tierOf = (entry: CardStrengthEntry) => tierFor(entry.card);

  // 所持による絞り込みはしない（共有画像は誰が見ても同じ全 UR 基準にする）
  const urCards = $derived(allCardsState.filter((c) => c.rarity === 'UR'));

  const panels = $derived(
    songsState.map((song, i) => {
      const entries = urCards.map((c) => buildCardStrengthEntry(c, allBroachsState, song, EVENT_BONUS_MULTIPLIER[tierFor(c)]));
      return {
        id: `share-panel-${i}`,
        suffix: `_${i + 1}`,
        page: i + 1,
        song,
        total: entries.length,
        topScoreUp: entries.filter((e) => classifyCard(e.card) === 'scoreUp').toSorted(compareScoreUpBy(SCORE_UP_SORT)).slice(0, TOP_N),
        topShrink: entries.filter((e) => classifyCard(e.card) === 'shrink').toSorted(compareShrinkBy(SHRINK_SORT)).slice(0, TOP_N),
      };
    }),
  );
</script>

<div class="mb-3 flex items-center justify-between gap-3 flex-wrap max-w-3xl">
  <p class="text-sm text-gray-600">
    下の枠をスクリーンショット、または右のボタンで画像保存して SNS でシェアできます。1 曲につき 1 枚、全 {panels.length} 枚に分けて保存します。
  </p>
  <EventShareImage filename={shareFilename} panels={panels.map((p) => ({ id: p.id, suffix: p.suffix }))} />
</div>

<!-- スクショ対象パネル（端末によらず同じダウンロード画像になるよう幅固定。狭い画面では横スクロール） -->
<div class="overflow-x-auto pb-2 space-y-4">
  {#each panels as panel (panel.id)}
    <div id={panel.id} data-testid="compare-share-panel" class="w-[1024px] shrink-0 rounded-xl border border-gray-200 shadow-lg overflow-hidden bg-white">
      <div class="bg-chrome-ink text-white px-4 py-3">
        <div class="flex items-baseline justify-between gap-2 flex-wrap">
          <!-- whitespace-nowrap: modern-screenshot が幅を小数 3 桁に丸めて固定するため、見出しが 1 行ぶんの高さのまま折り返して下の行に重なる。折り返し自体を禁止する -->
          <h2 class="text-lg font-bold leading-snug whitespace-nowrap">
            {event.eventname}
            <span class="ml-2 text-sm font-semibold text-gray-300">衣装比較 Top{TOP_N}{panels.length > 1 ? ` ${panel.page}/${panels.length}` : ''}</span>
          </h2>
          <span class="text-xs font-semibold text-gray-300 whitespace-nowrap">{SITE_NAME}</span>
        </div>
        <div class="mt-1 flex items-baseline gap-x-2 flex-wrap">
          <span class="text-base font-bold leading-snug">{panel.song.song_name}</span>
          <span class="text-sm font-semibold text-gray-300">{panel.song.difficulty || ''}</span>
          <span class="text-xs text-gray-300 tabular-nums">/ {panel.song.duration || '?'}秒 / {panel.song.notes_count || '?'}ノーツ</span>
          <span class="text-xs text-gray-300">/ UR 全 {panel.total} 着から Top{TOP_N}</span>
          <span class="text-xs text-gray-300">/ {hasBonus ? `特効 ${event.eventname}` : '特効なし'}</span>
        </div>
        <div class="mt-1 text-xs text-gray-300 space-x-2">
          <span>{event.eventtype}</span>
          <span>/</span>
          <span>{formatEventPeriod(event.start_date, event.end_date)}</span>
        </div>
      </div>

      <div class="px-4 py-2 border-b border-gray-200 bg-gray-50">
        <SongAttrRatio song={panel.song} />
      </div>

      <section class="pt-3">
        <div class="flex items-center gap-2 px-3">
          <span class="inline-block px-3 py-0.5 rounded-full text-sm font-bold whitespace-nowrap bg-chrome-ink text-white">スコアアップ Top{TOP_N}</span>
          <span class="text-xs text-gray-500">期待スコア合計の降順</span>
        </div>
        <ScoreUpChart entries={panel.topScoreUp} {tierOf} sortKey={SCORE_UP_SORT} compact />
      </section>

      <section class="pt-2 border-t border-gray-200">
        <div class="flex items-center gap-2 px-3 pt-2">
          <span class="inline-block px-3 py-0.5 rounded-full text-sm font-bold whitespace-nowrap bg-chrome-ink text-white">判定縮小 Top{TOP_N}</span>
          <span class="text-xs text-gray-500">属性値由来スコアの降順</span>
        </div>
        <ShrinkChart entries={panel.topShrink} {tierOf} sortKey={SHRINK_SORT} songDuration={panel.song.duration || 0} compact />
      </section>

      <p class="px-3 pb-3 text-[10px] leading-relaxed text-gray-500 border-t border-gray-200 pt-2">
        UR 限定 / 全ノーツ Perfect 前提 / センタースキル除外 / 固有ブローチ装備込み。
        グループ限定・全属性編成が条件の固有ブローチは条件を満たしたものとして加算しているため、編成しだいでは表示値に届きません。
        算出値は有志による計測・推定に基づくもので、ゲーム内の挙動と完全に一致することを保証するものではありません。
      </p>
    </div>
  {/each}
</div>
