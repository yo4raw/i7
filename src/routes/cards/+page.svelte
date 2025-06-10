<script lang="ts">
  import type { PageData } from './$types';
  import Badge from '$lib/components/Badge.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  
  export let data: PageData;
  
  // 検索フォームの状態
  let searchName = $page.url.searchParams.get('name') || '';
  let searchRarity = $page.url.searchParams.get('rarity') || '';
  let searchAttribute = $page.url.searchParams.get('attribute') || '';
  let searchCharacter = $page.url.searchParams.get('character') || '';
  let searchSkillType = $page.url.searchParams.get('skillType') || '';
  
  function handleImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const placeholder = img.nextElementSibling as HTMLElement;
    if (placeholder && placeholder.classList.contains('table-image-placeholder')) {
      placeholder.style.display = 'flex';
    }
  }
  
  function handleSearch() {
    const params = new URLSearchParams();
    if (searchName) params.set('name', searchName);
    if (searchRarity) params.set('rarity', searchRarity);
    if (searchAttribute) params.set('attribute', searchAttribute);
    if (searchCharacter) params.set('character', searchCharacter);
    if (searchSkillType) params.set('skillType', searchSkillType);
    // 検索時はページを1にリセット
    params.set('page', '1');
    
    goto(`/cards?${params.toString()}`);
  }
  
  function clearSearch() {
    searchName = '';
    searchRarity = '';
    searchAttribute = '';
    searchCharacter = '';
    searchSkillType = '';
    goto('/cards');
  }
  
  function goToPage(pageNumber: number) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set('page', pageNumber.toString());
    goto(`/cards?${params.toString()}`);
  }
</script>


<div class="mx-auto px-4 max-w-full">
  <h1 class="text-2xl font-bold text-gray-800 mb-4">カード一覧 </h1>
  
  <!-- 検索フォーム -->
  <div class="mb-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
    <h2 class="text-lg font-semibold mb-4 text-gray-700">検索条件</h2>
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
      <!-- カード名検索 -->
      <div>
        <label for="searchName" class="block text-sm font-medium text-gray-700 mb-1">
          カード名・キャラ名
        </label>
        <input
          id="searchName"
          type="text"
          bind:value={searchName}
          placeholder="例: 陸, RESTART"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      
      <!-- レアリティ選択 -->
      <div>
        <label for="searchRarity" class="block text-sm font-medium text-gray-700 mb-1">
          レアリティ
        </label>
        <select
          id="searchRarity"
          bind:value={searchRarity}
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">すべて</option>
          <option value="UR">UR</option>
          <option value="SSR">SSR</option>
          <option value="SR">SR</option>
          <option value="R">R</option>
          <option value="GROUP">グループ</option>
        </select>
      </div>
      
      <!-- 属性選択 -->
      <div>
        <label for="searchAttribute" class="block text-sm font-medium text-gray-700 mb-1">
          属性
        </label>
        <select
          id="searchAttribute"
          bind:value={searchAttribute}
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">すべて</option>
          <option value="1">Shout (赤)</option>
          <option value="2">Beat (青)</option>
          <option value="3">Melody (黄)</option>
        </select>
      </div>
      
      <!-- キャラクター選択 -->
      <div>
        <label for="searchCharacter" class="block text-sm font-medium text-gray-700 mb-1">
          キャラクター
        </label>
        <select
          id="searchCharacter"
          bind:value={searchCharacter}
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">すべて</option>
          <option value="一織">和泉一織</option>
          <option value="大和">二階堂大和</option>
          <option value="三月">和泉三月</option>
          <option value="環">四葉環</option>
          <option value="壮五">逢坂壮五</option>
          <option value="ナギ">六弥ナギ</option>
          <option value="陸">七瀬陸</option>
          <option value="楽">八乙女楽</option>
          <option value="天">九条天</option>
          <option value="龍之介">十龍之介</option>
          <option value="百">百</option>
          <option value="千">千</option>
          <option value="万理">万理</option>
          <option value="虎於">虎於</option>
          <option value="巳波">巳波</option>
          <option value="亥清悠">亥清悠</option>
          <option value="狗丸トウマ">狗丸トウマ</option>
        </select>
      </div>
      
      <!-- スキルタイプ選択 -->
      <div>
        <label for="searchSkillType" class="block text-sm font-medium text-gray-700 mb-1">
          スキルタイプ
        </label>
        <select
          id="searchSkillType"
          bind:value={searchSkillType}
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">すべて</option>
          <option value="スコアアップ">スコアアップ</option>
          <option value="判定強化">判定強化</option>
          <option value="ライフ回復">ライフ回復</option>
          <option value="コンボボーナス">コンボボーナス</option>
          <option value="タップスコアアップ">タップスコアアップ</option>
        </select>
      </div>
    </div>
    
    <!-- 検索ボタン -->
    <div class="flex gap-2">
      <button
        on:click={handleSearch}
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        検索
      </button>
      <button
        on:click={clearSearch}
        class="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
      >
        クリア
      </button>
    </div>
  </div>
  
  <div class="mb-4 bg-blue-50 p-4 rounded-lg">
    <p class="text-sm text-gray-600">
      {#if $page.url.searchParams.has('name') || $page.url.searchParams.has('rarity') || $page.url.searchParams.has('attribute') || $page.url.searchParams.has('character') || $page.url.searchParams.has('skillType')}
        検索結果: <span class="font-bold text-blue-600">{data.totalCount}枚</span>
        <span class="text-gray-500">
          (ページ {data.currentPage}/{data.totalPages} - 
          {Math.min((data.currentPage - 1) * data.itemsPerPage + 1, data.totalCount)}-{Math.min(data.currentPage * data.itemsPerPage, data.totalCount)}件を表示)
        </span>
      {:else}
        総カード数: <span class="font-bold text-blue-600">{data.totalCount}枚</span>
        <span class="text-gray-500">
          (ページ {data.currentPage}/{data.totalPages} - 
          {Math.min((data.currentPage - 1) * data.itemsPerPage + 1, data.totalCount)}-{Math.min(data.currentPage * data.itemsPerPage, data.totalCount)}件を表示)
        </span>
      {/if}
    </p>
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
                  src="/assets/cards/{card.id}.png" 
                  alt={card.cardname}
                  class="w-full h-full object-cover"
                  loading="lazy"
                  on:error={handleImageError}
                />
                <div class="absolute inset-0 hidden items-center justify-center bg-gray-400 text-white text-xs font-bold table-image-placeholder">
                  {card.card_id}
                </div>
              </div>
            </td>
            <td class="p-1 border border-gray-300 text-center font-mono">
              <a href="/card/{card.id}" class="text-blue-600 hover:underline">{card.card_id}</a>
            </td>
            <td class="p-1 border border-gray-300 text-center">
              {#if card.rarity === 'GROUP'}
                <Badge className="bg-gradient-to-r from-green-600 to-teal-600 text-white">グループ</Badge>
              {:else if card.rarity === 'UR'}
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
  
  <!-- ページネーションコントロール -->
  {#if data.totalPages > 1}
    <div class="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
      <!-- 前へボタン -->
      <button
        on:click={() => goToPage(data.currentPage - 1)}
        disabled={data.currentPage === 1}
        class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        前へ
      </button>
      
      <!-- ページ番号表示 -->
      <div class="flex items-center gap-2">
        <!-- 最初のページ -->
        {#if data.currentPage > 3}
          <button
            on:click={() => goToPage(1)}
            class="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
          >
            1
          </button>
          {#if data.currentPage > 4}
            <span class="text-gray-500">...</span>
          {/if}
        {/if}
        
        <!-- 現在のページ周辺 -->
        {#each Array(data.totalPages) as _, i}
          {#if i + 1 >= data.currentPage - 2 && i + 1 <= data.currentPage + 2}
            <button
              on:click={() => goToPage(i + 1)}
              class="px-3 py-1 {i + 1 === data.currentPage ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'} rounded transition-colors"
            >
              {i + 1}
            </button>
          {/if}
        {/each}
        
        <!-- 最後のページ -->
        {#if data.currentPage < data.totalPages - 2}
          {#if data.currentPage < data.totalPages - 3}
            <span class="text-gray-500">...</span>
          {/if}
          <button
            on:click={() => goToPage(data.totalPages)}
            class="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
          >
            {data.totalPages}
          </button>
        {/if}
      </div>
      
      <!-- 次へボタン -->
      <button
        on:click={() => goToPage(data.currentPage + 1)}
        disabled={data.currentPage === data.totalPages}
        class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        次へ
      </button>
    </div>
    
    <!-- ページジャンプ -->
    <div class="mt-4 flex items-center justify-center gap-2">
      <label for="pageJump" class="text-sm text-gray-600">ページへ移動:</label>
      <input
        id="pageJump"
        type="number"
        min="1"
        max={data.totalPages}
        value={data.currentPage}
        on:change={(e) => {
          const page = parseInt(e.currentTarget.value);
          if (page >= 1 && page <= data.totalPages) {
            goToPage(page);
          }
        }}
        class="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <span class="text-sm text-gray-600">/ {data.totalPages}</span>
    </div>
  {/if}
  
</div>

<style>
  /* 画像プレースホルダーの表示制御のみカスタムCSSで実装 */
  .table-image-placeholder {
    display: none;
  }
  
  img[style*="display: none"] + .table-image-placeholder {
    display: flex !important;
  }
</style>