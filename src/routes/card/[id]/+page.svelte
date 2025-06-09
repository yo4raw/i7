<script lang="ts">
  import type { PageData } from './$types';
  import Card from '$lib/components/Card.svelte';
  import CardHeader from '$lib/components/CardHeader.svelte';
  import CardContent from '$lib/components/CardContent.svelte';
  import Badge from '$lib/components/Badge.svelte';
  import Button from '$lib/components/Button.svelte';
  
  export let data: PageData;
  
  const card = data.card;
  
  function getAttributeName(attribute: number | undefined) {
    switch (attribute) {
      case 1: return 'Shout';
      case 2: return 'Beat';
      case 3: return 'Melody';
      default: return '-';
    }
  }
  
  function getAttributeColor(attribute: number | undefined) {
    switch (attribute) {
      case 1: return 'bg-red-500';
      case 2: return 'bg-blue-500';
      case 3: return 'bg-yellow-500';
      default: return 'bg-gray-400';
    }
  }
  
  function getRarityClass(rarity: string) {
    switch (rarity) {
      case 'UR': return 'bg-gradient-to-r from-purple-600 to-pink-600 text-white';
      case 'SSR': return 'bg-yellow-300 text-yellow-900';
      case 'SR': return 'bg-purple-300 text-purple-900';
      case 'R': return 'bg-blue-300 text-blue-900';
      default: return 'bg-gray-300 text-gray-700';
    }
  }
  
  const totalStats = (card.shout_max || 0) + (card.beat_max || 0) + (card.melody_max || 0);
  
  function handleImageError(e: Event) {
    const target = e.target;
    if (target instanceof HTMLImageElement) {
      // Hide the broken image and show placeholder
      target.style.display = 'none';
      const placeholder = target.nextElementSibling;
      if (placeholder instanceof HTMLElement) {
        placeholder.style.display = 'flex';
      }
    }
  }
</script>

<div class="max-w-6xl mx-auto px-4 py-8">
  <div class="mb-6">
    <Button href="/cards" variant="ghost" size="sm" className="gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m12 19-7-7 7-7"/>
        <path d="M19 12H5"/>
      </svg>
      カード一覧に戻る
    </Button>
  </div>
  
  <Card className="shadow-lg">
    <div class="lg:grid lg:grid-cols-2 lg:gap-8">
      <!-- 左側：カード画像 -->
      <div class="p-8 bg-gray-50">
        <div class="aspect-[3/4] bg-white rounded-lg shadow-md overflow-hidden relative">
          <img 
            src="/assets/cards/{card.card_id}.png" 
            alt={card.cardname}
            class="w-full h-full object-contain"
            on:error={handleImageError}
          />
          <div class="absolute inset-0 hidden items-center justify-center bg-gray-200">
            <div class="text-center">
              <div class="text-6xl text-gray-400 mb-2">🎵</div>
              <div class="text-gray-500">No Image</div>
              <div class="text-sm text-gray-400">#{card.card_id}</div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 右側：カード情報 -->
      <div class="p-8">
        <!-- カード名とID -->
        <div class="mb-6">
          <h1 class="text-3xl font-bold text-gray-900 mb-2">{card.cardname}</h1>
          <div class="flex items-center gap-4">
            <span class="text-gray-600">ID: #{card.card_id}</span>
            {#if card.rarity === 'UR'}
              <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-3 py-1">{card.rarity}</Badge>
            {:else if card.rarity === 'SSR'}
              <Badge className="bg-yellow-300 text-yellow-900 px-3 py-1">{card.rarity}</Badge>
            {:else if card.rarity === 'SR'}
              <Badge className="bg-purple-300 text-purple-900 px-3 py-1">{card.rarity}</Badge>
            {:else if card.rarity === 'R'}
              <Badge className="bg-blue-300 text-blue-900 px-3 py-1">{card.rarity}</Badge>
            {:else}
              <Badge className="px-3 py-1">{card.rarity}</Badge>
            {/if}
          </div>
        </div>
        
        <!-- 基本情報 -->
        <div class="mb-6 border-t pt-6">
          <h2 class="text-xl font-semibold mb-4">基本情報</h2>
          <dl class="grid grid-cols-2 gap-4">
            <div>
              <dt class="text-sm text-gray-600">キャラクター</dt>
              <dd class="font-medium">{card.name}</dd>
            </div>
            {#if card.name_other}
              <div>
                <dt class="text-sm text-gray-600">別名</dt>
                <dd class="font-medium">{card.name_other}</dd>
              </div>
            {/if}
            {#if card.groupname}
              <div>
                <dt class="text-sm text-gray-600">グループ</dt>
                <dd class="font-medium">{card.groupname}</dd>
              </div>
            {/if}
            <div>
              <dt class="text-sm text-gray-600">属性</dt>
              <dd class="font-medium">
                <span class="inline-flex items-center gap-2">
                  <span class={`inline-block w-6 h-6 rounded-full ${getAttributeColor(card.attribute)}`}></span>
                  {getAttributeName(card.attribute)}
                </span>
              </dd>
            </div>
          </dl>
        </div>
        
        <!-- ステータス -->
        {#if card.shout_max || card.beat_max || card.melody_max}
          <div class="mb-6 border-t pt-6">
            <h2 class="text-xl font-semibold mb-4">ステータス（最大値）</h2>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-red-600 font-medium">Shout</span>
                <span class="font-mono">{card.shout_max || 0}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-blue-600 font-medium">Beat</span>
                <span class="font-mono">{card.beat_max || 0}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-green-600 font-medium">Melody</span>
                <span class="font-mono">{card.melody_max || 0}</span>
              </div>
              <div class="flex items-center justify-between border-t pt-3">
                <span class="font-semibold">合計</span>
                <span class="font-mono font-bold text-lg">{totalStats}</span>
              </div>
            </div>
          </div>
        {/if}
        
        <!-- スキル情報 -->
        {#if card.ap_skill_name || card.ct_skill}
          <div class="mb-6 border-t pt-6">
            <h2 class="text-xl font-semibold mb-4">スキル</h2>
            {#if card.ap_skill_name}
              <div class="mb-4">
                <h3 class="text-sm text-gray-600 mb-1">APスキル</h3>
                <p class="font-medium">{card.ap_skill_name}</p>
                {#if card.ap_skill_type}
                  <p class="text-sm text-gray-500">タイプ: {card.ap_skill_type}</p>
                {/if}
              </div>
            {/if}
            {#if card.ct_skill}
              <div>
                <h3 class="text-sm text-gray-600 mb-1">CTスキル</h3>
                <p class="text-sm">{card.ct_skill}</p>
              </div>
            {/if}
          </div>
        {/if}
        
        <!-- その他の情報 -->
        <div class="border-t pt-6">
          <dl class="space-y-2 text-sm">
            {#if card.get_type}
              <div class="flex justify-between">
                <dt class="text-gray-600">入手方法</dt>
                <dd>{card.get_type}</dd>
              </div>
            {/if}
            {#if card.story}
              <div class="flex justify-between">
                <dt class="text-gray-600">ストーリー</dt>
                <dd>{card.story}</dd>
              </div>
            {/if}
            {#if card.sp_time}
              <div class="flex justify-between">
                <dt class="text-gray-600">SP時間</dt>
                <dd>{card.sp_time}秒</dd>
              </div>
            {/if}
          </dl>
        </div>
      </div>
    </div>
  </Card>
</div>