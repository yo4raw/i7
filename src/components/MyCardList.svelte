<script lang="ts">
  import type { CardListItem } from '../lib/cardListData';
  import { allCounts, reloadFromStorage } from '../lib/stores/cardCounts.svelte';
  import { refreshData } from '../lib/data/clientRefresh';
  import { fetchCardsJson } from '../lib/data/fetchCardsJson';
  import CardTableRow from './cards/CardTableRow.svelte';
  import CardMobileCard from './cards/CardMobileCard.svelte';

  type Props = {
    cards: CardListItem[];
    base: string;
    thumbUrl: string;
  };

  let { cards: initialCards, base, thumbUrl }: Props = $props();

  let cards = $state(initialCards);
  let owned = $derived.by(() => {
    const counts = allCounts();
    return cards
      .filter((c) => (counts[String(c.ID)] || 0) > 0)
      .sort((a, b) => b.ID - a.ID);
  });

  let totalOwnedCount = $derived.by(() => {
    const counts = allCounts();
    return Object.values(counts).reduce((a, b) => a + b, 0);
  });

  $effect(() => {
    reloadFromStorage();
    refreshData('cards', fetchCardsJson, (fresh) => {
      cards = fresh as CardListItem[];
    });
  });
</script>

{#if owned.length === 0}
  <div class="text-center py-12 text-gray-500">
    <p class="text-lg mb-2">所持カードがありません</p>
    <p class="text-sm"><a href={`${base}cards/`} class="text-indigo-600 hover:underline">カード一覧</a>で所持数を登録してください</p>
  </div>
{:else}
  <div>
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="flex items-center gap-4 text-sm text-gray-600">
        <span>所持種類: {owned.length}種</span>
        <span>合計枚数: {totalOwnedCount}枚</span>
      </div>
    </div>

    <div class="hidden md:block overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-gray-100 text-left text-xs text-gray-500 uppercase">
            <th class="px-3 py-2 w-16">画像</th>
            <th class="px-3 py-2">ID</th>
            <th class="px-3 py-2">カード名</th>
            <th class="px-3 py-2">キャラ</th>
            <th class="px-3 py-2">レア</th>
            <th class="px-3 py-2">属性</th>
            <th class="px-3 py-2 w-20">属性比率</th>
            <th class="px-3 py-2 text-right">Shout</th>
            <th class="px-3 py-2 text-right">Beat</th>
            <th class="px-3 py-2 text-right">Melody</th>
            <th class="px-3 py-2">スキル</th>
            <th class="px-3 py-2 w-28 text-center">所持数</th>
          </tr>
        </thead>
        <tbody>
          {#each owned as card (card.ID)}
            <CardTableRow {card} {base} {thumbUrl} />
          {/each}
        </tbody>
      </table>
    </div>
    <div class="md:hidden space-y-3">
      {#each owned as card (card.ID)}
        <CardMobileCard {card} {base} {thumbUrl} />
      {/each}
    </div>
  </div>
{/if}
