<script lang="ts">
  import type { PageData } from './$types';
  import Badge from '$lib/components/Badge.svelte';
  
  export let data: PageData;
  
  function handleImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const placeholder = img.parentElement?.querySelector('.table-image-placeholder') as HTMLElement;
    if (placeholder) {
      placeholder.style.display = 'flex';
    }
  }
</script>

<div class="mx-auto px-4 max-w-full">
  <h1 class="text-2xl font-bold text-gray-800 mb-4">カード一覧 ✨</h1>
  
  <div class="mb-4 bg-blue-50 p-4 rounded-lg">
    <p class="text-sm text-gray-600">総カード数: <span class="font-bold text-blue-600">{data.totalCount}枚</span></p>j
  </div>
  
  <div class="overflow-x-auto">
    <table class="w-full text-xs border-collapse bg-white">
      <thead>
        <tr class="bg-gray-100 border-b-2 border-gray-300">
          <th class="p-1 border border-gray-300 text-center font-normal">画像</th>
          <th class="p-1 border border-gray-300 text-center font-normal w-16">カードID</th>
          <th class="p-1 border border-gray-300 text-center font-normal w-20">レア</th>
          <th class="p-1 border border-gray-300 text-center font-normal w-16">属性</th>
          <th class="p-1 border border-gray-300 text-center font-normal w-16">SP<br/>時間</th>
          <th class="p-1 border border-gray-300 text-center font-normal">入手方法</th>
          <th class="p-1 border border-gray-300 text-center font-normal">ストーリー</th>
          <th class="p-1 border border-gray-300 text-center font-normal w-16">Shout<br/>最大</th>
          <th class="p-1 border border-gray-300 text-center font-normal w-16">Beat<br/>最大</th>
          <th class="p-1 border border-gray-300 text-center font-normal w-16">Melody<br/>最大</th>
          <th class="p-1 border border-gray-300 text-center font-normal w-16">合計<br/>最大</th>
          <th class="p-1 border border-gray-300 text-center font-normal">APスキル</th>
        </tr>
      </thead>
      <tbody>
        {#each data.cards as card}
          <tr class="hover:bg-yellow-50 border-b border-gray-200">
            <td class="p-1 border border-gray-300 text-center">
              <div class="relative w-12 h-12 mx-auto overflow-hidden bg-gray-100">
                <img 
                  src="https://i7.step-on-dream.net/img/cards/th/{card.id}.png" 
                  alt={card.cardname}
                  class="w-full h-full object-cover"
                  loading="lazy"
                  on:error={handleImageError}
                />
                <div class="absolute inset-0 hidden items-center justify-center bg-gray-400 text-white text-xs font-bold image-placeholder">
                  {card.card_id}
                </div>
              </div>
            </td>
            <td class="p-1 border border-gray-300 text-center font-mono">
              <a href="/card/{card.id}" class="text-blue-600 hover:underline">{card.card_id}</a>
            </td>
            <td class="p-1 border border-gray-300 text-center">
              {#if card.rarity === 'UR'}
                <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">{card.rarity}</Badge>
              {:else if card.rarity === 'SSR'}
                <Badge className="bg-yellow-300 text-yellow-900">{card.rarity}</Badge>
              {:else if card.rarity === 'SR'}
                <Badge className="bg-purple-300 text-purple-900">{card.rarity}</Badge>
              {:else if card.rarity === 'R'}
                <Badge className="bg-blue-300 text-blue-900">{card.rarity}</Badge>
              {:else}
                <Badge>{card.rarity}</Badge>
              {/if}
            </td>
            <td class="p-1 border border-gray-300 text-center">
              {#if card.attribute}
                <span class="inline-block w-8 h-8 rounded-full text-white font-bold flex items-center justify-center
                  {card.attribute === 1 ? 'bg-red-500' : ''}
                  {card.attribute === 2 ? 'bg-blue-500' : ''}
                  {card.attribute === 3 ? 'bg-yellow-500' : ''}">
                  {card.attribute === 1 ? 'S' : ''}
                  {card.attribute === 2 ? 'B' : ''}
                  {card.attribute === 3 ? 'M' : ''}
                </span>
              {:else}
                -
              {/if}
            </td>
            <td class="p-1 border border-gray-300 text-center">{card.sp_time || '-'}</td>
            <td class="p-1 border border-gray-300 text-center text-xs">{card.get_type || '-'}</td>
            <td class="p-1 border border-gray-300 text-center text-xs">{card.story || '-'}</td>
            <td class="p-1 border border-gray-300 text-center font-mono text-xs">{card.shout_max || '-'}</td>
            <td class="p-1 border border-gray-300 text-center font-mono text-xs">{card.beat_max || '-'}</td>
            <td class="p-1 border border-gray-300 text-center font-mono text-xs">{card.melody_max || '-'}</td>
            <td class="p-1 border border-gray-300 text-center font-mono text-xs font-bold">
              {card.shout_max && card.beat_max && card.melody_max ? card.shout_max + card.beat_max + card.melody_max : '-'}
            </td>
            <td class="p-1 border border-gray-300 text-xs">
              <div class="text-center">
                {card.ap_skill_name || '-'}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  
</div>

<style>
  /* 画像プレースホルダーの表示制御のみカスタムCSSで実装 */
  .image-placeholder {
    display: none;
  }
  
  img[style*="display: none"] + .image-placeholder {
    display: flex !important;
  }
</style>