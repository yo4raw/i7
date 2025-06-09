<script lang="ts">
  import type { PageData } from './$types';
  
  export let data: PageData;
  
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };
  
  const formatPercentage = (value: number | string | null) => {
    if (value === null || value === undefined) return '-';
    // If value is already a percentage (from database as decimal type)
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return '-';
    return `${numValue.toFixed(1)}%`;
  };
  
  // Group songs by type
  const groupedSongs = data.songs.reduce((acc, song) => {
    const type = song.songType || 'その他';
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(song);
    return acc;
  }, {} as Record<string, typeof data.songs>);
  
  const songTypes = Object.keys(groupedSongs)
    .filter(type => type !== 'その他')
    .sort();
  
  // Create pie chart SVG
  function createPieChart(shout: number | string | null, beat: number | string | null, melody: number | string | null) {
    const s = typeof shout === 'string' ? parseFloat(shout) : (shout || 0);
    const b = typeof beat === 'string' ? parseFloat(beat) : (beat || 0);
    const m = typeof melody === 'string' ? parseFloat(melody) : (melody || 0);
    
    if (s === 0 && b === 0 && m === 0) return null;
    
    const total = s + b + m;
    const shoutAngle = (s / total) * 360;
    const beatAngle = (b / total) * 360;
    
    // Calculate SVG path coordinates
    const radius = 20;
    const centerX = 25;
    const centerY = 25;
    
    // Helper function to convert angle to coordinates
    function angleToCoords(angle: number) {
      const radian = (angle - 90) * Math.PI / 180;
      return {
        x: centerX + radius * Math.cos(radian),
        y: centerY + radius * Math.sin(radian)
      };
    }
    
    // Create path data
    const shoutEnd = angleToCoords(shoutAngle);
    const beatEnd = angleToCoords(shoutAngle + beatAngle);
    
    const shoutLargeArc = shoutAngle > 180 ? 1 : 0;
    const beatLargeArc = beatAngle > 180 ? 1 : 0;
    const melodyLargeArc = 360 - shoutAngle - beatAngle > 180 ? 1 : 0;
    
    return {
      shout: `M ${centerX} ${centerY} L ${centerX} ${centerY - radius} A ${radius} ${radius} 0 ${shoutLargeArc} 1 ${shoutEnd.x} ${shoutEnd.y} Z`,
      beat: `M ${centerX} ${centerY} L ${shoutEnd.x} ${shoutEnd.y} A ${radius} ${radius} 0 ${beatLargeArc} 1 ${beatEnd.x} ${beatEnd.y} Z`,
      melody: `M ${centerX} ${centerY} L ${beatEnd.x} ${beatEnd.y} A ${radius} ${radius} 0 ${melodyLargeArc} 1 ${centerX} ${centerY - radius} Z`
    };
  }
</script>

<svelte:head>
  <title>楽曲一覧 - IDOLiSH7 Database</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-6">楽曲一覧</h1>
  
  {#if data.songs.length === 0}
    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
      <p class="text-yellow-800">楽曲データがありません。</p>
    </div>
  {:else}
    <div class="mb-4 text-gray-600">
      全 {data.songs.filter(song => song.songType !== 'その他').length} 曲
    </div>
    
    {#each songTypes as type}
      <div class="mb-8">
        <h2 class="text-2xl font-semibold mb-4 text-gray-800">{type}</h2>
        
        <div class="overflow-x-auto">
          <table class="min-w-full bg-white rounded-lg overflow-hidden shadow-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  楽曲名
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  アーティスト
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  難易度
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ノーツ数
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  時間
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shout
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Beat
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Melody
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  属性比率
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              {#each groupedSongs[type] as song}
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-sm font-medium text-gray-900">
                    {song.songName}
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-600">
                    {song.artistName || '-'}
                  </td>
                  <td class="px-4 py-3 text-sm text-center">
                    {#if song.difficulty}
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        {song.difficulty === 'EXPERT+' ? 'bg-purple-100 text-purple-800' :
                         song.difficulty === 'EXPERT' ? 'bg-red-100 text-red-800' : 
                         song.difficulty === 'HARD' ? 'bg-orange-100 text-orange-800' :
                         song.difficulty === 'NORMAL' ? 'bg-blue-100 text-blue-800' :
                         'bg-green-100 text-green-800'}">
                        {song.difficulty}
                      </span>
                    {:else}
                      -
                    {/if}
                  </td>
                  <td class="px-4 py-3 text-sm text-center text-gray-600">
                    {song.notesCount || '-'}
                  </td>
                  <td class="px-4 py-3 text-sm text-center text-gray-600">
                    {formatDuration(song.durationSeconds)}
                  </td>
                  <td class="px-4 py-3 text-sm text-center">
                    <span class="text-red-600 font-medium">
                      {formatPercentage(song.shoutPercentage)}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-center">
                    <span class="text-blue-600 font-medium">
                      {formatPercentage(song.beatPercentage)}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-center">
                    <span class="text-green-600 font-medium">
                      {formatPercentage(song.melodyPercentage)}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-center">
                    {#if createPieChart(song.shoutPercentage, song.beatPercentage, song.melodyPercentage)}
                      {@const paths = createPieChart(song.shoutPercentage, song.beatPercentage, song.melodyPercentage)}
                      <div class="flex justify-center group relative">
                        <svg width="50" height="50" viewBox="0 0 50 50" class="inline-block">
                          <path d={paths.shout} fill="#ef4444" stroke="#fff" stroke-width="1" />
                          <path d={paths.beat} fill="#3b82f6" stroke="#fff" stroke-width="1" />
                          <path d={paths.melody} fill="#10b981" stroke="#fff" stroke-width="1" />
                        </svg>
                        <div class="absolute bottom-full mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                          <div class="flex items-center gap-1">
                            <span class="w-2 h-2 bg-red-500 inline-block"></span>
                            Shout: {formatPercentage(song.shoutPercentage)}
                          </div>
                          <div class="flex items-center gap-1">
                            <span class="w-2 h-2 bg-blue-500 inline-block"></span>
                            Beat: {formatPercentage(song.beatPercentage)}
                          </div>
                          <div class="flex items-center gap-1">
                            <span class="w-2 h-2 bg-green-500 inline-block"></span>
                            Melody: {formatPercentage(song.melodyPercentage)}
                          </div>
                        </div>
                      </div>
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
    {/each}
  {/if}
</div>

<style>
  :global(html) {
    scroll-behavior: smooth;
  }
</style>