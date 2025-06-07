<script lang="ts">
  import type { PageData } from './$types';
  
  export let data: PageData;
  
  const rarityColors: Record<string, string> = {
    'SSR': '#ffd700',
    'SR': '#c0c0c0',
    'R': '#cd7f32',
    'N': '#888888'
  };
</script>

<svelte:head>
  <title>レアリティ一覧 | アイドリッシュセブン 攻略ガイド</title>
</svelte:head>

<div class="container">
  <h1>レアリティ一覧</h1>
  <p class="subtitle">レアリティごとのカード枚数</p>
  
  <div class="rarity-grid">
    {#each data.rarities as rarity}
      <a href="/search?rarity={encodeURIComponent(rarity.rarity)}" class="rarity-card">
        <div 
          class="rarity-header" 
          style="background-color: {rarityColors[rarity.rarity] || '#999999'}"
        >
          <h2>{rarity.rarity}</h2>
        </div>
        <div class="rarity-info">
          <p class="card-count">{rarity.count} 枚</p>
          <p class="percentage">
            ({((rarity.count / data.totalCards) * 100).toFixed(1)}%)
          </p>
        </div>
      </a>
    {/each}
  </div>
  
  <div class="stats-summary">
    <h2>統計情報</h2>
    <div class="stats-chart">
      {#each data.rarities as rarity}
        <div class="stat-bar">
          <div class="bar-label">{rarity.rarity}</div>
          <div class="bar-container">
            <div 
              class="bar-fill" 
              style="width: {(rarity.count / data.totalCards) * 100}%; background-color: {rarityColors[rarity.rarity] || '#999999'}"
            ></div>
            <span class="bar-value">{rarity.count}</span>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }
  
  h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }
  
  .subtitle {
    color: #666;
    margin-bottom: 2rem;
  }
  
  .rarity-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 3rem;
  }
  
  .rarity-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    transition: all 0.3s ease;
  }
  
  .rarity-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.1);
  }
  
  .rarity-header {
    padding: 2rem;
    text-align: center;
    color: white;
    text-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
  
  .rarity-header h2 {
    font-size: 2rem;
    margin: 0;
  }
  
  .rarity-info {
    padding: 1.5rem;
    text-align: center;
    background: #f8f8f8;
  }
  
  .card-count {
    font-size: 2.5rem;
    font-weight: bold;
    color: #333;
    margin-bottom: 0.5rem;
  }
  
  .percentage {
    color: #666;
    font-size: 1.1rem;
  }
  
  .stats-summary {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 2rem;
  }
  
  .stats-summary h2 {
    margin-bottom: 1.5rem;
    color: #333;
  }
  
  .stats-chart {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .stat-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  
  .bar-label {
    min-width: 60px;
    font-weight: bold;
    color: #666;
  }
  
  .bar-container {
    flex: 1;
    background: #f0f0f0;
    border-radius: 4px;
    height: 30px;
    position: relative;
    overflow: hidden;
  }
  
  .bar-fill {
    height: 100%;
    transition: width 0.5s ease;
  }
  
  .bar-value {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    font-weight: bold;
    color: #333;
  }
</style>