<script lang="ts">
  import type { Card } from '../lib/data/fetchCardsJson';
  import type { Song } from '../lib/data/fetchSongsJson';
  import { normalizeAttribute } from '../lib/score/types';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';
  import { cardThumbUrl } from '../lib/ui';
  import RarityBadge from './ui/RarityBadge.svelte';
  import AttributeBadge from './ui/AttributeBadge.svelte';

  type Props = {
    cards: Card[];
    songs: Song[];
    base: string;
  };

  let { cards, songs, base }: Props = $props();

  const SLOT_LABELS = ['センター', 'メンバー1', 'メンバー2', 'メンバー3', 'メンバー4', 'フレンド'];
  const DISPLAY_ORDER = [1, 2, 0, 3, 4, 5];

  type SavedDeck = {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    state: {
      songId: number | null;
      deckIds: (number | null)[];
      bonusTiers: string[];
      trained: boolean[];
      sharedBroachs: number[][];
      skillLevels: number[];
    };
  };

  let decks = $state<SavedDeck[]>([]);

  $effect(() => {
    decks = loadJson<SavedDeck[]>(STORAGE_KEYS.SAVED_DECKS, []);
  });

  function writeDecks(next: SavedDeck[]) {
    decks = next;
    saveJson(STORAGE_KEYS.SAVED_DECKS, next);
  }

  function loadDeckToCalc(deckId: string) {
    const target = decks.find((d) => d.id === deckId);
    if (!target) return;
    saveJson(STORAGE_KEYS.SCORE_CALC_STATE, target.state);
    window.location.href = `${base}score-calc/`;
  }

  function renameDeck(deckId: string) {
    const target = decks.find((d) => d.id === deckId);
    if (!target) return;
    const newName = prompt('新しいデッキ名', target.name);
    if (!newName) return;
    const next = decks.map((d) =>
      d.id === deckId ? { ...d, name: newName.trim() || d.name, updatedAt: Date.now() } : d
    );
    writeDecks(next);
  }

  function deleteDeck(deckId: string) {
    if (!confirm('このデッキを削除しますか？')) return;
    writeDecks(decks.filter((d) => d.id !== deckId));
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  const reverseDecks = $derived([...decks].reverse());
</script>

{#if decks.length === 0}
  <div class="text-center py-12 text-gray-500 dark:text-slate-400">
    <p class="text-lg mb-2">保存されたデッキがありません</p>
    <p class="text-sm"><a href={`${base}score-calc/`} class="text-indigo-600 hover:underline">スコア計算</a>でデッキを保存してください</p>
  </div>
{:else}
  <div class="space-y-4">
    {#each reverseDecks as d (d.id)}
      {@const song = d.state.songId != null ? songs.find((s) => s.id === d.state.songId) : null}
      {@const songName = song?.song_name ?? null}
      {@const cardCount = (d.state.deckIds || []).filter((id) => id != null).length}
      <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
        <div class="flex items-start justify-between mb-3">
          <div class="min-w-0 flex-1">
            <h2 class="text-sm font-bold text-gray-800 dark:text-slate-100 truncate">{d.name}</h2>
            <div class="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
              {formatDate(d.updatedAt)} / {cardCount}枚{songName ? ` / ${songName}` : ''}
            </div>
          </div>
          <div class="flex gap-2 flex-shrink-0 ml-3">
            <button type="button" class="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition-colors" onclick={() => loadDeckToCalc(d.id)}>読み込む</button>
            <button type="button" class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors" onclick={() => renameDeck(d.id)}>名前変更</button>
            <button type="button" class="text-xs px-2 py-1 bg-red-50 text-red-500 rounded hover:bg-red-100 transition-colors" onclick={() => deleteDeck(d.id)}>削除</button>
          </div>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-1">
          {#each DISPLAY_ORDER as i}
            {@const cardId = d.state.deckIds?.[i]}
            {@const card = cardId != null ? cards.find((c) => c.ID === cardId) : null}
            {@const label = SLOT_LABELS[i]}
            {@const labelClass = i === 0 ? 'text-indigo-600 font-bold' : i === 5 ? 'text-amber-600 font-bold' : 'text-gray-500'}
            {#if card}
              {@const attr = normalizeAttribute(card.attribute)}
              <div class="flex flex-col items-center">
                <div class="text-[9px] {labelClass} mb-0.5">{label}</div>
                <img src={cardThumbUrl(card.ID!)} alt={card.cardname || ''} class="w-10 h-auto rounded" loading="lazy" />
                <div class="flex gap-0.5 mt-0.5">
                  <RarityBadge rarity={card.rarity} sizeClass="px-0.5 py-px text-[7px]" fallbackLabel="?" />
                  <AttributeBadge attribute={attr} sizeClass="px-0.5 py-px text-[7px]" />
                </div>
                <div class="text-[8px] text-gray-500 dark:text-slate-400 truncate max-w-[60px] text-center" title={card.cardname || ''}>{card.cardname || ''}</div>
              </div>
            {:else}
              <div class="flex flex-col items-center">
                <div class="text-[9px] {labelClass} mb-0.5">{label}</div>
                <div class="w-10 h-14 bg-gray-100 dark:bg-slate-800 rounded flex items-center justify-center">
                  <span class="text-gray-300 dark:text-slate-600 text-lg">-</span>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/if}
