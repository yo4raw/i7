<script lang="ts">
  import type { PageData } from './$types';
  
  export let data: PageData;
  
  let searchQuery = '';
  let selectedRarity = '';
  let selectedCharacter = '';
  let selectedAttribute = '';
  
  $: hasFilters = searchQuery || selectedRarity || selectedCharacter || selectedAttribute;
</script>

<svelte:head>
  <title>カード検索 | アイドリッシュセブン 攻略ガイド</title>
</svelte:head>

<div class="container">
  <h1>カード検索</h1>
  
  <form method="GET" action="/search" class="search-form">
    <div class="search-field">
      <label for="q">キーワード検索</label>
      <input
        type="text"
        id="q"
        name="q"
        placeholder="カード名、キャラクター名で検索"
        bind:value={searchQuery}
      />
    </div>
    
    <div class="filter-grid">
      <div class="filter-field">
        <label for="rarity">レアリティ</label>
        <select id="rarity" name="rarity" bind:value={selectedRarity}>
          <option value="">すべて</option>
          {#each data.rarities as rarity}
            <option value={rarity.rarity}>{rarity.rarity} ({rarity.count})</option>
          {/each}
        </select>
      </div>
      
      <div class="filter-field">
        <label for="character">キャラクター</label>
        <select id="character" name="character" bind:value={selectedCharacter}>
          <option value="">すべて</option>
          {#each data.characters as character}
            <option value={character.name}>{character.name} ({character.count})</option>
          {/each}
        </select>
      </div>
      
      <div class="filter-field">
        <label for="attribute">属性</label>
        <select id="attribute" name="attribute" bind:value={selectedAttribute}>
          <option value="">すべて</option>
          <option value="1">Shout</option>
          <option value="2">Beat</option>
          <option value="3">Melody</option>
        </select>
      </div>
    </div>
    
    <div class="button-group">
      <button type="submit" class="search-button">検索</button>
      {#if hasFilters}
        <a href="/search" class="clear-button">クリア</a>
      {/if}
    </div>
  </form>
  
  {#if data.results}
    <div class="results-section">
      <h2>検索結果 ({data.results.length}件)</h2>
      
      {#if data.results.length === 0}
        <p class="no-results">該当するカードが見つかりませんでした。</p>
      {:else}
        <div class="card-grid">
          {#each data.results as card}
            <a href="/card/{card.id}" class="card-link">
              <div class="card">
                <img src="/assets/cards/{card.id}.png" alt={card.cardname} loading="lazy" />
                <div class="card-info">
                  <h3>{card.cardname}</h3>
                  <p class="character">{card.name}</p>
                  <div class="meta">
                    <span class="rarity">{card.rarity}</span>
                    <span class="id">#{card.id}</span>
                  </div>
                </div>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }
  
  h1 {
    font-size: 2rem;
    margin-bottom: 2rem;
  }
  
  .search-form {
    background: #f8f8f8;
    padding: 2rem;
    border-radius: 8px;
    margin-bottom: 2rem;
  }
  
  .search-field {
    margin-bottom: 1.5rem;
  }
  
  .search-field label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
  }
  
  .search-field input {
    width: 100%;
    padding: 0.75rem;
    font-size: 1rem;
    border: 1px solid #ddd;
    border-radius: 4px;
  }
  
  .filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .filter-field label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
  }
  
  .filter-field select {
    width: 100%;
    padding: 0.75rem;
    font-size: 1rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
  }
  
  .button-group {
    display: flex;
    gap: 1rem;
  }
  
  .search-button {
    padding: 0.75rem 2rem;
    font-size: 1rem;
    background: #333;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.3s ease;
  }
  
  .search-button:hover {
    background: #555;
  }
  
  .clear-button {
    padding: 0.75rem 2rem;
    font-size: 1rem;
    background: white;
    color: #333;
    border: 1px solid #ddd;
    border-radius: 4px;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    transition: background 0.3s ease;
  }
  
  .clear-button:hover {
    background: #f5f5f5;
  }
  
  .results-section h2 {
    font-size: 1.5rem;
    margin-bottom: 1.5rem;
  }
  
  .no-results {
    text-align: center;
    color: #666;
    padding: 3rem;
    font-size: 1.1rem;
  }
  
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1.5rem;
  }
  
  .card-link {
    text-decoration: none;
    color: inherit;
  }
  
  .card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.3s ease;
  }
  
  .card:hover {
    transform: translateY(-4px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.1);
  }
  
  .card img {
    width: 100%;
    height: auto;
    display: block;
  }
  
  .card-info {
    padding: 1rem;
  }
  
  .card-info h3 {
    font-size: 1rem;
    margin-bottom: 0.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .character {
    font-size: 0.9rem;
    color: #666;
    margin-bottom: 0.75rem;
  }
  
  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .rarity {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: #f0f0f0;
    border-radius: 4px;
    font-size: 0.8rem;
    color: #666;
  }
  
  .id {
    font-size: 0.8rem;
    color: #999;
  }
</style>