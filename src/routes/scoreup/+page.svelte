<script lang="ts">
  import type { PageData } from './$types';
  import Card from '$lib/components/Card.svelte';
  import Button from '$lib/components/Button.svelte';
  import Badge from '$lib/components/Badge.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  
  export let data: PageData;
  
  let showFilters = true;
  let sortBy: 'score' | 'id' | 'date' = 'score';
  let sortOrder: 'asc' | 'desc' = 'desc';
  let selectedSkillLevel = 5; // Default to max level
  let showFavoritesOnly = false;
  let favorites: Set<number> = new Set();
  
  // Load favorites from localStorage
  if (browser) {
    const saved = localStorage.getItem('scoreup-favorites');
    if (saved) {
      favorites = new Set(JSON.parse(saved));
    }
  }
  
  // Form state
  let nameFilter = data.searchParams.name || '';
  let rarityFilters = data.searchParams.rarity || [];
  let attributeFilters = data.searchParams.attribute || [];
  let yearFilter = data.searchParams.year || '';
  let skillLevelFilter = data.searchParams.skillLevel || '';
  let characterFilters = data.searchParams.characterIds || [];
  let costumeFilter = data.searchParams.costumeName || '';
  let activationTypeFilter = data.searchParams.skillActivationType || '';
  let skillTypeFilters = data.searchParams.skillType || [];
  let eventBonusFilter = data.searchParams.eventBonus || false;
  
  // Toggle all checkboxes
  function toggleAllCharacters() {
    if (characterFilters.length === data.characters.length) {
      characterFilters = [];
    } else {
      characterFilters = data.characters.map(c => c.id);
    }
  }
  
  function toggleAllRarities() {
    if (rarityFilters.length === 2) {
      rarityFilters = [];
    } else {
      rarityFilters = ['UR', 'SSR'];
    }
  }
  
  function toggleAllAttributes() {
    if (attributeFilters.length === 3) {
      attributeFilters = [];
    } else {
      attributeFilters = [1, 2, 3];
    }
  }
  
  function toggleAllSkillTypes() {
    if (skillTypeFilters.length === data.skillTypes.length) {
      skillTypeFilters = [];
    } else {
      skillTypeFilters = [...data.skillTypes];
    }
  }
  
  // Favorite management
  function toggleFavorite(cardId: number) {
    if (favorites.has(cardId)) {
      favorites.delete(cardId);
    } else {
      favorites.add(cardId);
    }
    favorites = favorites; // Trigger reactivity
    
    if (browser) {
      localStorage.setItem('scoreup-favorites', JSON.stringify([...favorites]));
    }
  }
  
  // Calculate score up value for display
  function getScoreUpValue(card: any, level?: number) {
    const targetLevel = level || selectedSkillLevel;
    if (!card.skill_details || card.skill_details.length === 0) return 0;
    
    const detail = card.skill_details.find((d: any) => d.skill_level === targetLevel);
    if (!detail) return 0;
    
    // Calculate expected value: (value * rate / 100)
    return Math.floor((detail.value * detail.rate) / 100);
  }
  
  // Get skill activation type
  function getSkillActivationType(card: any) {
    if (card.sp_time && card.sp_time > 0) {
      return `${card.sp_time}秒毎`;
    }
    if (card.skill_details && card.skill_details[0]) {
      const detail = card.skill_details[0];
      if (detail.per === 1) {
        return `Perfect ${detail.count}回`;
      } else if (detail.count >= 30) {
        return `コンボ ${detail.count}回`;
      }
    }
    return '-';
  }
  
  // Filter cards by favorites if enabled
  $: filteredCards = showFavoritesOnly 
    ? data.cards.filter(card => favorites.has(card.id))
    : data.cards;
  
  // Sort cards
  $: sortedCards = [...filteredCards].sort((a, b) => {
    let compareValue = 0;
    
    switch (sortBy) {
      case 'score':
        compareValue = getScoreUpValue(b, selectedSkillLevel) - getScoreUpValue(a, selectedSkillLevel);
        break;
      case 'id':
        compareValue = b.id - a.id;
        break;
      case 'date':
        const dateA = a.year ? new Date(a.year, (a.month || 1) - 1, a.day || 1).getTime() : 0;
        const dateB = b.year ? new Date(b.year, (b.month || 1) - 1, b.day || 1).getTime() : 0;
        compareValue = dateB - dateA;
        break;
    }
    
    return sortOrder === 'desc' ? compareValue : -compareValue;
  });
  
  function handleSearch() {
    const params = new URLSearchParams();
    
    if (nameFilter) params.set('name', nameFilter);
    rarityFilters.forEach(r => params.append('rarity', r));
    attributeFilters.forEach(a => params.append('attribute', a.toString()));
    characterFilters.forEach(c => params.append('character', c.toString()));
    if (costumeFilter) params.set('costume', costumeFilter);
    if (yearFilter) params.set('year', yearFilter);
    if (activationTypeFilter) params.set('activationType', activationTypeFilter);
    skillTypeFilters.forEach(s => params.append('skillType', s));
    if (eventBonusFilter) params.set('eventBonus', 'true');
    if (skillLevelFilter) params.set('skillLevel', skillLevelFilter);
    
    goto(`/scoreup?${params.toString()}`);
  }
  
  function clearFilters() {
    nameFilter = '';
    rarityFilters = [];
    attributeFilters = [];
    characterFilters = [];
    costumeFilter = '';
    yearFilter = '';
    activationTypeFilter = '';
    skillTypeFilters = [];
    eventBonusFilter = false;
    skillLevelFilter = '';
    handleSearch();
  }
  
  function getAttributeName(attribute: number) {
    switch (attribute) {
      case 1: return 'Shout';
      case 2: return 'Beat';
      case 3: return 'Melody';
      default: return '-';
    }
  }
  
  function getAttributeColor(attribute: number) {
    switch (attribute) {
      case 1: return 'text-red-600';
      case 2: return 'text-blue-600';
      case 3: return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  }
</script>

<div class="max-w-7xl mx-auto px-4 py-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">スコアアップ検索</h1>
    <p class="text-gray-600">スキルのスコアアップ値で検索・比較できます</p>
  </div>
  
  <!-- Filters -->
  <Card className="mb-6">
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold">検索フィルター</h2>
        <Button
          variant="ghost"
          size="sm"
          on:click={() => showFilters = !showFilters}
        >
          {showFilters ? '非表示' : '表示'}
        </Button>
      </div>
      
      {#if showFilters}
        <form on:submit|preventDefault={handleSearch} class="space-y-4">
          <!-- Character selection -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-sm font-medium text-gray-700">
                キャラクター
              </label>
              <button
                type="button"
                on:click={toggleAllCharacters}
                class="text-xs text-blue-600 hover:underline"
              >
                {characterFilters.length === data.characters.length ? '全解除' : '全選択'}
              </button>
            </div>
            <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 p-3 border rounded-md max-h-40 overflow-y-auto">
              {#each data.characters as character}
                <label class="flex items-center text-sm">
                  <input
                    type="checkbox"
                    bind:group={characterFilters}
                    value={character.id}
                    class="mr-1"
                  />
                  <span class="truncate">{character.name}</span>
                </label>
              {/each}
            </div>
          </div>
          
          <!-- Name/Costume search -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                キャラクター名・カード名
              </label>
              <input
                type="text"
                bind:value={nameFilter}
                placeholder="検索..."
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                衣装名
              </label>
              <input
                type="text"
                bind:value={costumeFilter}
                placeholder="衣装名で検索..."
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <!-- Rarity and Attribute -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-sm font-medium text-gray-700">
                  レアリティ
                </label>
                <button
                  type="button"
                  on:click={toggleAllRarities}
                  class="text-xs text-blue-600 hover:underline"
                >
                  {rarityFilters.length === 2 ? '全解除' : '全選択'}
                </button>
              </div>
              <div class="flex gap-3">
                {#each ['UR', 'SSR'] as rarity}
                  <label class="flex items-center">
                    <input
                      type="checkbox"
                      bind:group={rarityFilters}
                      value={rarity}
                      class="mr-2"
                    />
                    <span>{rarity}</span>
                  </label>
                {/each}
              </div>
            </div>
            
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-sm font-medium text-gray-700">
                  属性
                </label>
                <button
                  type="button"
                  on:click={toggleAllAttributes}
                  class="text-xs text-blue-600 hover:underline"
                >
                  {attributeFilters.length === 3 ? '全解除' : '全選択'}
                </button>
              </div>
              <div class="flex gap-3">
                {#each [[1, 'Shout', 'text-red-600'], [2, 'Beat', 'text-blue-600'], [3, 'Melody', 'text-yellow-600']] as [value, label, color]}
                  <label class="flex items-center">
                    <input
                      type="checkbox"
                      bind:group={attributeFilters}
                      value={value}
                      class="mr-2"
                    />
                    <span class={color}>{label}</span>
                  </label>
                {/each}
              </div>
            </div>
          </div>
          
          <!-- Year and Skill Level -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                登場年
              </label>
              <select
                bind:value={yearFilter}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">すべて</option>
                {#each data.years as year}
                  <option value={year}>{year}年</option>
                {/each}
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                スキルレベル（検索用）
              </label>
              <select
                bind:value={skillLevelFilter}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">すべて</option>
                {#each [1, 2, 3, 4, 5] as level}
                  <option value={level}>Lv{level}</option>
                {/each}
              </select>
            </div>
          </div>
          
          <!-- Skill Activation Type -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              スキル発動
            </label>
            <div class="flex gap-3">
              <label class="flex items-center">
                <input
                  type="radio"
                  bind:group={activationTypeFilter}
                  value=""
                  class="mr-2"
                />
                <span>すべて</span>
              </label>
              <label class="flex items-center">
                <input
                  type="radio"
                  bind:group={activationTypeFilter}
                  value="timer"
                  class="mr-2"
                />
                <span>タイマー（秒毎）</span>
              </label>
              <label class="flex items-center">
                <input
                  type="radio"
                  bind:group={activationTypeFilter}
                  value="perfect"
                  class="mr-2"
                />
                <span>Perfect</span>
              </label>
              <label class="flex items-center">
                <input
                  type="radio"
                  bind:group={activationTypeFilter}
                  value="combo"
                  class="mr-2"
                />
                <span>コンボ</span>
              </label>
            </div>
          </div>
          
          <!-- Skill Types -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-sm font-medium text-gray-700">
                スキルタイプ
              </label>
              <button
                type="button"
                on:click={toggleAllSkillTypes}
                class="text-xs text-blue-600 hover:underline"
              >
                {skillTypeFilters.length === data.skillTypes.length ? '全解除' : '全選択'}
              </button>
            </div>
            <div class="grid grid-cols-2 gap-2 p-3 border rounded-md max-h-32 overflow-y-auto">
              {#each data.skillTypes as skillType}
                <label class="flex items-center text-sm">
                  <input
                    type="checkbox"
                    bind:group={skillTypeFilters}
                    value={skillType}
                    class="mr-1"
                  />
                  <span class="truncate">{skillType}</span>
                </label>
              {/each}
            </div>
          </div>
          
          <!-- Event Bonus -->
          <div>
            <label class="flex items-center">
              <input
                type="checkbox"
                bind:checked={eventBonusFilter}
                class="mr-2"
              />
              <span class="text-sm font-medium text-gray-700">イベント特効カードのみ</span>
            </label>
          </div>
          
          <!-- Search buttons -->
          <div class="flex gap-2">
            <Button type="submit">検索</Button>
            <Button variant="outline" on:click={clearFilters}>クリア</Button>
          </div>
        </form>
      {/if}
    </div>
  </Card>
  
  <!-- Results controls -->
  <div class="mb-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
    <div class="flex items-center gap-4">
      <span class="text-gray-600">
        {filteredCards.length}件の結果
      </span>
      <label class="flex items-center">
        <input
          type="checkbox"
          bind:checked={showFavoritesOnly}
          class="mr-2"
        />
        <span class="text-sm">お気に入りのみ</span>
      </label>
    </div>
    
    <div class="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      <!-- Skill level selector for display -->
      <div class="flex items-center gap-2">
        <label class="text-sm text-gray-600">表示レベル:</label>
        <select
          bind:value={selectedSkillLevel}
          class="px-3 py-1 border border-gray-300 rounded-md text-sm"
        >
          {#each [1, 2, 3, 4, 5] as level}
            <option value={level}>Lv{level}</option>
          {/each}
        </select>
      </div>
      
      <!-- Sort controls -->
      <div class="flex items-center gap-2">
        <label class="text-sm text-gray-600">並び替え:</label>
        <select
          bind:value={sortBy}
          class="px-3 py-1 border border-gray-300 rounded-md text-sm"
        >
          <option value="score">スコア順</option>
          <option value="id">ID順</option>
          <option value="date">実装日順</option>
        </select>
        <button
          on:click={() => sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'}
          class="p-1 hover:bg-gray-100 rounded"
        >
          {#if sortOrder === 'desc'}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 8 4-4 4 4"/>
              <path d="M7 4v16"/>
              <path d="M15 8h6"/>
              <path d="M15 12h4"/>
              <path d="M15 16h2"/>
            </svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 16 4 4 4-4"/>
              <path d="M7 20V4"/>
              <path d="M15 8h6"/>
              <path d="M15 12h4"/>
              <path d="M15 16h2"/>
            </svg>
          {/if}
        </button>
      </div>
    </div>
  </div>
  
  <!-- Results table -->
  <div class="overflow-x-auto">
    <table class="min-w-full bg-white border border-gray-200">
      <thead>
        <tr class="bg-gray-50">
          <th class="px-2 py-3 text-center">
            <span class="text-yellow-500">★</span>
          </th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            ID
          </th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            カード
          </th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            レアリティ
          </th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            属性
          </th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            スキル
          </th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            発動
          </th>
          {#each [1, 2, 3, 4, 5] as level}
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Lv{level}
            </th>
          {/each}
          <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
            期待値
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-200">
        {#each sortedCards as card}
          <tr class="hover:bg-gray-50">
            <td class="px-2 py-3 text-center">
              <button
                on:click={() => toggleFavorite(card.id)}
                class="text-xl hover:scale-110 transition-transform"
              >
                {favorites.has(card.id) ? '⭐' : '☆'}
              </button>
            </td>
            <td class="px-4 py-3 text-sm">
              #{card.card_id}
            </td>
            <td class="px-4 py-3">
              <a href="/card/{card.id}" class="flex items-center gap-3 hover:underline">
                <img 
                  src="https://i7.step-on-dream.net/img/cards/th/{card.id}.png" 
                  alt={card.cardname}
                  class="w-12 h-16 object-cover rounded"
                />
                <div>
                  <div class="font-medium text-sm">{card.cardname}</div>
                  <div class="text-xs text-gray-600">{card.name}</div>
                </div>
              </a>
            </td>
            <td class="px-4 py-3">
              <Badge className={card.rarity === 'UR' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white' : 'bg-yellow-300 text-yellow-900'}>
                {card.rarity}
              </Badge>
            </td>
            <td class="px-4 py-3">
              <span class={getAttributeColor(card.attribute)}>
                {getAttributeName(card.attribute)}
              </span>
            </td>
            <td class="px-4 py-3">
              <div class="text-sm">{card.ap_skill_name}</div>
              <div class="text-xs text-gray-600">{card.ap_skill_type}</div>
            </td>
            <td class="px-4 py-3 text-sm">
              {getSkillActivationType(card)}
            </td>
            {#each [1, 2, 3, 4, 5] as level}
              {@const detail = card.skill_details?.find(d => d.skill_level === level)}
              <td class="px-4 py-3 text-center text-sm">
                {#if detail}
                  <div>{detail.value.toLocaleString()}</div>
                  <div class="text-xs text-gray-500">{detail.rate}%</div>
                {:else}
                  -
                {/if}
              </td>
            {/each}
            <td class="px-4 py-3 text-center">
              <div class="font-semibold text-lg {selectedSkillLevel === 5 ? 'text-purple-600' : ''}">
                {getScoreUpValue(card, selectedSkillLevel).toLocaleString()}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  
  {#if sortedCards.length === 0}
    <div class="text-center py-12">
      <p class="text-gray-500">検索条件に一致するカードが見つかりませんでした</p>
    </div>
  {/if}
</div>