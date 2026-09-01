<script lang="ts">
  import { onMount } from 'svelte';
  import type { Card } from '../lib/data/fetchCardsJson';
  import type { Song } from '../lib/data/fetchSongsJson';
  import { normalizeAttribute } from '../lib/score/types';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';
  import { cardThumbUrl } from '../lib/ui';
  import RarityBadge from './ui/RarityBadge.svelte';
  import AttributeBadge from './ui/AttributeBadge.svelte';
  import ModalDialog from './ui/ModalDialog.svelte';

  // oxlint-disable-next-line no-unassigned-vars -- Svelte の bind:this 代入を静的解析できず誤検知
  let dialog: ModalDialog | undefined;

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

  // 同期層が別端末のデッキを取り込んだ通知。DOM イベント名の文字列だけを購読し、
  // src/lib/sync/ からは何も import しない（同期層を削除しても今日と同じ挙動になる）
  onMount(() => {
    const onSyncApplied = () => {
      decks = loadJson<SavedDeck[]>(STORAGE_KEYS.SAVED_DECKS, []);
    };
    window.addEventListener('i7:sync-applied', onSyncApplied);
    return () => window.removeEventListener('i7:sync-applied', onSyncApplied);
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

  async function renameDeck(deckId: string) {
    const target = decks.find((d) => d.id === deckId);
    if (!target) return;
    const newName = await dialog?.prompt({
      title: '新しいデッキ名',
      value: target.name,
      placeholder: 'デッキ名',
      confirmLabel: '変更する',
    });
    if (!newName) return;
    const next = decks.map((d) =>
      d.id === deckId ? { ...d, name: newName.trim() || d.name, updatedAt: Date.now() } : d
    );
    writeDecks(next);
  }

  async function deleteDeck(deckId: string) {
    const target = decks.find((d) => d.id === deckId);
    const ok = await dialog?.confirm({
      title: 'このデッキを削除しますか？',
      message: target ? `「${target.name}」を削除します。この操作は取り消せません。` : undefined,
      confirmLabel: '削除する',
      danger: true,
    });
    if (!ok) return;
    writeDecks(decks.filter((d) => d.id !== deckId));
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  const reverseDecks = $derived([...decks].toReversed());
</script>

{#if decks.length === 0}
  <div class="text-center py-12 text-gray-500">
    <p class="text-lg mb-2">保存されたデッキがありません</p>
    <p class="text-sm text-pretty"><a href={`${base}score-calc/`} class="text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-900">スコア計算</a>でデッキを保存してください</p>
  </div>
{:else}
  <div class="space-y-4">
    {#each reverseDecks as d (d.id)}
      {@const song = d.state.songId != null ? songs.find((s) => s.id === d.state.songId) : null}
      {@const songName = song?.song_name ?? null}
      {@const cardCount = (d.state.deckIds || []).filter((id) => id != null).length}
      <div class="surface-card p-4">
        <div class="flex items-start justify-between mb-3">
          <div class="min-w-0 flex-1">
            <h2 class="text-sm font-bold text-gray-800 truncate">{d.name}</h2>
            <div class="text-[10px] text-gray-400 mt-0.5">
              {formatDate(d.updatedAt)} / {cardCount}枚{songName ? ` / ${songName}` : ''}
            </div>
          </div>
          <div class="flex gap-2 flex-shrink-0 ml-3">
            <button type="button" class="text-xs px-2 py-1 bg-chrome-ink text-white rounded hover:bg-chrome-ink-soft transition-colors" onclick={() => loadDeckToCalc(d.id)}>読み込む</button>
            <button type="button" class="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors" onclick={() => renameDeck(d.id)}>名前変更</button>
            <button type="button" class="text-xs px-2 py-1 bg-red-50 text-red-500 rounded hover:bg-red-100 transition-colors" onclick={() => deleteDeck(d.id)}>削除</button>
          </div>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-1">
          {#each DISPLAY_ORDER as i}
            {@const cardId = d.state.deckIds?.[i]}
            {@const card = cardId != null ? cards.find((c) => c.ID === cardId) : null}
            {@const label = SLOT_LABELS[i]}
            {@const labelClass = i === 0 ? 'text-gray-900 font-bold' : i === 5 ? 'text-amber-600 font-bold' : 'text-gray-500'}
            {#if card}
              {@const attr = normalizeAttribute(card.attribute)}
              <div class="flex flex-col items-center">
                <div class="text-[9px] {labelClass} mb-0.5">{label}</div>
                <img src={cardThumbUrl(card.ID!)} alt={card.cardname || ''} class="w-10 h-auto rounded" loading="lazy" />
                <div class="flex gap-0.5 mt-0.5">
                  <RarityBadge rarity={card.rarity} sizeClass="px-0.5 py-px text-[7px]" fallbackLabel="?" />
                  <AttributeBadge attribute={attr} sizeClass="px-0.5 py-px text-[7px]" />
                </div>
                <div class="text-[8px] text-gray-500 truncate max-w-[60px] text-center" title={card.cardname || ''}>{card.cardname || ''}</div>
              </div>
            {:else}
              <div class="flex flex-col items-center">
                <div class="text-[9px] {labelClass} mb-0.5">{label}</div>
                <div class="w-10 h-14 bg-gray-100 rounded flex items-center justify-center">
                  <span class="text-gray-300 text-lg">-</span>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/if}

<ModalDialog bind:this={dialog} />
