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
        <div class="aspect-[3/4] bg-white rounded-lg shadow-md overflow-hidden">
          <img 
            src="https://i7.step-on-dream.net/img/cards/{card.id}.png" 
            alt={card.cardname}
            class="w-full h-full object-contain"
          />
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
            <div>
              <dt class="text-sm text-gray-600">グループ</dt>
              <dd class="font-medium">{card.groupname || '-'}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-600">入手方法</dt>
              <dd class="font-medium">{card.get_type || '-'}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-600">ストーリー</dt>
              <dd class="font-medium">{card.story || '-'}</dd>
            </div>
            {#if card.awakening_item}
              <div>
                <dt class="text-sm text-gray-600">覚醒アイテム</dt>
                <dd class="font-medium">{card.awakening_item}</dd>
              </div>
            {/if}
          </dl>
        </div>
        
        <!-- ステータス -->
        {#if card.attribute}
          <div class="mb-6 border-t pt-6">
            <h2 class="text-xl font-semibold mb-4">ステータス</h2>
            <div class="mb-4">
              <span class="text-sm text-gray-600">属性:</span>
              <span class="inline-block ml-2 px-3 py-1 rounded-full text-white text-sm font-bold {getAttributeColor(card.attribute)}">
                {getAttributeName(card.attribute)}
              </span>
            </div>
            <div class="space-y-3">
              <div>
                <div class="flex justify-between mb-1">
                  <span class="text-sm font-medium">Shout</span>
                  <span class="text-sm text-gray-600">{card.shout_min || 0} → {card.shout_max || 0}</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-red-500 h-2 rounded-full" style="width: {((card.shout_max || 0) / 8000) * 100}%"></div>
                </div>
              </div>
              <div>
                <div class="flex justify-between mb-1">
                  <span class="text-sm font-medium">Beat</span>
                  <span class="text-sm text-gray-600">{card.beat_min || 0} → {card.beat_max || 0}</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-blue-500 h-2 rounded-full" style="width: {((card.beat_max || 0) / 8000) * 100}%"></div>
                </div>
              </div>
              <div>
                <div class="flex justify-between mb-1">
                  <span class="text-sm font-medium">Melody</span>
                  <span class="text-sm text-gray-600">{card.melody_min || 0} → {card.melody_max || 0}</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-yellow-500 h-2 rounded-full" style="width: {((card.melody_max || 0) / 8000) * 100}%"></div>
                </div>
              </div>
              <div class="pt-3 border-t">
                <div class="flex justify-between">
                  <span class="font-medium">合計</span>
                  <span class="font-bold text-lg">{totalStats}</span>
                </div>
              </div>
            </div>
          </div>
        {/if}
        
        <!-- スキル情報 -->
        {#if card.ap_skill_name || card.sp_time}
          <div class="mb-6 border-t pt-6">
            <h2 class="text-xl font-semibold mb-4">スキル情報</h2>
            <dl class="space-y-3">
              {#if card.ap_skill_name}
                <div>
                  <dt class="text-sm text-gray-600">APスキル</dt>
                  <dd class="font-medium">{card.ap_skill_name}</dd>
                  {#if card.ap_skill_type}
                    <dd class="text-sm text-gray-600 mt-1">タイプ: {card.ap_skill_type}</dd>
                  {/if}
                  {#if card.ap_skill_req}
                    <dd class="text-sm text-gray-600">必要AP: {card.ap_skill_req}</dd>
                  {/if}
                  {#if card.comment}
                    <dd class="text-sm text-gray-600 mt-2">{card.comment}</dd>
                  {/if}
                </div>
              {/if}
              {#if card.ct_skill}
                <div>
                  <dt class="text-sm text-gray-600">CTスキル</dt>
                  <dd class="font-medium">{card.ct_skill}</dd>
                </div>
              {/if}
              {#if card.sp_time}
                <div>
                  <dt class="text-sm text-gray-600">SP時間</dt>
                  <dd class="font-medium">{card.sp_time}秒</dd>
                  {#if card.sp_value}
                    <dd class="text-sm text-gray-600">SP値: {card.sp_value}</dd>
                  {/if}
                </div>
              {/if}
            </dl>
          </div>
        {/if}
        
        <!-- スキルレベル詳細 -->
        {#if card.skill_details && card.skill_details.length > 0}
          <div class="mb-6 border-t pt-6">
            <h2 class="text-xl font-semibold mb-4">スキルレベル詳細</h2>
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="border-b">
                    <th class="text-left py-2 px-3">レベル</th>
                    <th class="text-left py-2 px-3">発動条件</th>
                    <th class="text-left py-2 px-3">確率</th>
                    <th class="text-left py-2 px-3">効果</th>
                  </tr>
                </thead>
                <tbody>
                  {#each card.skill_details as detail}
                    <tr class="border-b hover:bg-gray-50">
                      <td class="py-2 px-3 font-medium">Lv{detail.skill_level}</td>
                      <td class="py-2 px-3">
                        {#if detail.count}
                          {detail.per === 1 ? 'Perfect' : detail.per === 2 ? 'Great' : 'Good'} {detail.count}回
                        {:else}
                          -
                        {/if}
                      </td>
                      <td class="py-2 px-3">{detail.rate ? `${detail.rate}%` : '-'}</td>
                      <td class="py-2 px-3">
                        {#if detail.value}
                          スコア {detail.value.toLocaleString()} UP
                        {:else}
                          -
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}
        
        <!-- ブローチ情報 -->
        {#if card.broach_shout || card.broach_beat || card.broach_melody}
          <div class="mb-6 border-t pt-6">
            <h2 class="text-xl font-semibold mb-4">ブローチ情報</h2>
            <dl class="space-y-2">
              <div class="grid grid-cols-3 gap-4">
                {#if card.broach_shout}
                  <div>
                    <dt class="text-sm text-gray-600">Shout</dt>
                    <dd class="font-medium text-red-600">+{card.broach_shout}</dd>
                  </div>
                {/if}
                {#if card.broach_beat}
                  <div>
                    <dt class="text-sm text-gray-600">Beat</dt>
                    <dd class="font-medium text-blue-600">+{card.broach_beat}</dd>
                  </div>
                {/if}
                {#if card.broach_melody}
                  <div>
                    <dt class="text-sm text-gray-600">Melody</dt>
                    <dd class="font-medium text-yellow-600">+{card.broach_melody}</dd>
                  </div>
                {/if}
              </div>
              {#if card.broach_req}
                <div>
                  <dt class="text-sm text-gray-600">必要ブローチ数</dt>
                  <dd class="font-medium">{card.broach_req}個</dd>
                </div>
              {/if}
            </dl>
          </div>
        {/if}
        
        <!-- リリース情報 -->
        {#if card.year || card.event}
          <div class="mb-6 border-t pt-6">
            <h2 class="text-xl font-semibold mb-4">リリース情報</h2>
            <dl class="space-y-2">
              {#if card.year && card.month && card.day}
                <div>
                  <dt class="text-sm text-gray-600">実装日</dt>
                  <dd class="font-medium">{card.year}年{card.month}月{card.day}日</dd>
                </div>
              {/if}
              {#if card.event}
                <div>
                  <dt class="text-sm text-gray-600">イベント</dt>
                  <dd class="font-medium">{card.event}</dd>
                </div>
              {/if}
              {#if card.updatetime}
                <div>
                  <dt class="text-sm text-gray-600">最終更新</dt>
                  <dd class="font-medium">{new Date(card.updatetime).toLocaleString('ja-JP')}</dd>
                </div>
              {/if}
            </dl>
          </div>
        {/if}
      </div>
    </div>
  </Card>
</div>