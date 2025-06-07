<script lang="ts">
  import type { PageData } from './$types';
  
  export let data: PageData;
</script>

<svelte:head>
  <title>キャラクター一覧 | アイドリッシュセブン 攻略ガイド</title>
</svelte:head>

<div class="container">
  <h1>キャラクター一覧</h1>
  <p class="subtitle">キャラクターごとのカード枚数</p>
  
  <div class="character-grid">
    {#each data.characters as character}
      <a href="/search?character={encodeURIComponent(character.name)}" class="character-card">
        <div class="character-info">
          <h2>{character.name}</h2>
          <p class="card-count">{character.count} 枚</p>
        </div>
      </a>
    {/each}
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
  
  .character-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1.5rem;
  }
  
  .character-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 2rem;
    text-decoration: none;
    color: inherit;
    transition: all 0.3s ease;
    text-align: center;
  }
  
  .character-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.1);
    border-color: #333;
  }
  
  .character-info h2 {
    font-size: 1.5rem;
    margin-bottom: 1rem;
    color: #333;
  }
  
  .card-count {
    font-size: 2rem;
    font-weight: bold;
    color: #666;
  }
</style>