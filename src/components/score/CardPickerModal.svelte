<script lang="ts">
  import { tick } from 'svelte';
  import type { Card } from '../../lib/data/fetchCardsJson';
  import { cardTextMatches } from '../../lib/cardFilter';
  import { normalizeAttribute } from '../../lib/score/types';
  import { STORAGE_KEYS, loadJson } from '../../lib/storage';
  import { cardThumbUrl } from '../../lib/ui';
  import RarityBadge from '../ui/RarityBadge.svelte';
  import AttributeBadge from '../ui/AttributeBadge.svelte';

  let { allCards, onPick, onClear }: {
    allCards: Card[];
    /** 衣装が選択された (slotIndex は open() で渡されたもの) */
    onPick: (slotIndex: number, card: Card) => void;
    /** クリアボタン (slotIndex のスロットを空にする) */
    onClear: (slotIndex: number) => void;
  } = $props();

  let visible = $state(false);
  let slotIndex = $state(-1);
  let slotLabel = $state('');

  // フィルタ状態 (searchText は 200ms デバウンス後の確定値)
  let searchText = $state('');
  let rarity = $state('');
  let attribute = $state('');
  let ownedOnly = $state(true);

  let searchInputEl: HTMLInputElement | undefined;
  let debounceTimer: ReturnType<typeof setTimeout>;

  const filtered = $derived.by(() => {
    const text = searchText.toLowerCase();
    const counts = loadJson<Record<string, number>>(STORAGE_KEYS.CARD_COUNTS, {});
    const result = allCards.filter(card => {
      if (ownedOnly && !(counts[String(card.ID)] >= 1)) return false;
      if (!cardTextMatches(card, text)) return false;
      if (rarity && card.rarity !== rarity) return false;
      if (attribute && normalizeAttribute(card.attribute) !== attribute) return false;
      return true;
    });
    result.sort((a, b) => (b.ID || 0) - (a.ID || 0));
    return result;
  });

  /** 親（命令的コード）から呼ぶ: モーダルを開く。フィルタは毎回リセットされる */
  export function open(slot: number, label: string): void {
    slotIndex = slot;
    slotLabel = label;
    // フレンド枠 (5) は所持外も表示、それ以外は所持衣装のみで開く（既存挙動）
    ownedOnly = slot !== 5;
    searchText = '';
    rarity = '';
    attribute = '';
    visible = true;
    tick().then(() => searchInputEl?.focus());
  }

  export function close(): void {
    clearTimeout(debounceTimer);
    visible = false;
    slotIndex = -1;
  }

  function onSearchInput(e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { searchText = value; }, 200);
  }

  function pick(card: Card) {
    if (slotIndex < 0) return;
    onPick(slotIndex, card);
    close();
  }

  function clear() {
    if (slotIndex >= 0) {
      onClear(slotIndex);
      close();
    }
  }
</script>

<!-- 衣装選択モーダル -->
{#if visible}
  <div id="card-picker-modal" class="fixed inset-0 z-50">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="absolute inset-0 bg-black/50" id="modal-backdrop" onclick={close}></div>
    <div class="relative max-w-2xl mx-auto mt-8 mb-8 bg-white dark:bg-slate-800 rounded-lg shadow-xl max-h-[85vh] flex flex-col mx-4 sm:mx-auto">
      <div class="p-4 border-b flex-shrink-0">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-gray-700 dark:text-slate-200">衣装選択 - <span id="modal-slot-label">{slotLabel}</span></h3>
          <button id="modal-close-x" type="button" class="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 text-xl leading-none" onclick={close}>&times;</button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input type="text" id="modal-search" placeholder="衣装名/キャラ名" class="col-span-2 border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" bind:this={searchInputEl} oninput={onSearchInput} />
          <select id="modal-rarity" class="border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm" bind:value={rarity}>
            <option value="">レアリティ</option>
            <option value="UR">UR</option>
            <option value="SSR">SSR</option>
            <option value="SR">SR</option>
            <option value="R">R</option>
          </select>
          <select id="modal-attribute" class="border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm" bind:value={attribute}>
            <option value="">属性</option>
            <option value="Shout">Shout</option>
            <option value="Beat">Beat</option>
            <option value="Melody">Melody</option>
          </select>
        </div>
        <div class="mt-2 flex items-center gap-3">
          <label class="flex items-center gap-1 text-xs">
            <input type="checkbox" id="modal-owned-only" bind:checked={ownedOnly} />
            <span>所持衣装のみ</span>
          </label>
          <span id="modal-result-count" class="text-xs text-gray-500 dark:text-slate-400">{filtered.length}件</span>
        </div>
      </div>
      <div id="modal-card-list" class="overflow-y-auto flex-1 p-2">
        {#each filtered.slice(0, 200) as card (card.ID)}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div class="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-slate-900 cursor-pointer border-b border-gray-100 dark:border-slate-800" data-pick-card={card.ID} onclick={() => pick(card)}>
            <img src={cardThumbUrl(card.ID!)} alt={card.cardname || ''} class="w-10 h-auto rounded flex-shrink-0" loading="lazy" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1">
                <RarityBadge rarity={card.rarity} sizeClass="px-1 py-0.5 text-[9px]" fallbackLabel="?" />
                <AttributeBadge attribute={normalizeAttribute(card.attribute)} sizeClass="px-1 py-0.5 text-[9px]" />
                <span class="text-xs font-medium truncate">{card.cardname || ''}</span>
              </div>
              <div class="text-[10px] text-gray-500 dark:text-slate-400">{card.name || ''} | 合計: {((card.shout_max || 0) + (card.beat_max || 0) + (card.melody_max || 0)).toLocaleString()} | {card.ap_skill_type || '-'}</div>
            </div>
          </div>
        {:else}
          <p class="text-sm text-gray-400 dark:text-slate-500 text-center py-8">該当する衣装がありません</p>
        {/each}
      </div>
      <div class="p-3 border-t flex justify-between flex-shrink-0">
        <button id="modal-clear" type="button" class="text-sm text-red-500 hover:underline" onclick={clear}>枠をクリア</button>
        <button id="modal-close" type="button" class="px-4 py-1.5 bg-gray-200 dark:bg-slate-700 rounded text-sm hover:bg-gray-300 dark:hover:bg-slate-600" onclick={close}>閉じる</button>
      </div>
    </div>
  </div>
{/if}
