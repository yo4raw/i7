<script lang="ts">
  import type { PageData } from './$types';
  
  export let data: PageData;
  
  let currentPage = 1;
  const cardsPerPage = 50;
  
  $: totalPages = Math.ceil(data.totalCards / cardsPerPage);
  $: paginationRange = getPaginationRange(currentPage, totalPages);
  
  function getPaginationRange(current: number, total: number): number[] {
    const range = [];
    const delta = 2;
    
    for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) {
      range.push(i);
    }
    
    return range;
  }
</script>

<svelte:head>
  <title>カード一覧 | アイドリッシュセブン 攻略ガイド</title>
</svelte:head>

<div class="container">
  <header>
    <h1>カード一覧</h1>
    <p>全 {data.totalCards} 枚</p>
  </header>
  
  <div class="card-grid">
    {#each data.cards as card}
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
  
  <nav class="pagination">
    <a 
      href="/cards?page={currentPage - 1}" 
      class="page-link"
      class:disabled={currentPage === 1}
    >
      前へ
    </a>
    
    {#if paginationRange[0] > 1}
      <a href="/cards?page=1" class="page-link">1</a>
      {#if paginationRange[0] > 2}
        <span class="ellipsis">...</span>
      {/if}
    {/if}
    
    {#each paginationRange as page}
      <a 
        href="/cards?page={page}" 
        class="page-link"
        class:active={page === currentPage}
      >
        {page}
      </a>
    {/each}
    
    {#if paginationRange[paginationRange.length - 1] < totalPages}
      {#if paginationRange[paginationRange.length - 1] < totalPages - 1}
        <span class="ellipsis">...</span>
      {/if}
      <a href="/cards?page={totalPages}" class="page-link">{totalPages}</a>
    {/if}
    
    <a 
      href="/cards?page={currentPage + 1}" 
      class="page-link"
      class:disabled={currentPage === totalPages}
    >
      次へ
    </a>
  </nav>
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }
  
  header {
    margin-bottom: 2rem;
  }
  
  h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }
  
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1.5rem;
    margin-bottom: 3rem;
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
  
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
  }
  
  .page-link {
    padding: 0.5rem 1rem;
    text-decoration: none;
    color: #333;
    border: 1px solid #ddd;
    border-radius: 4px;
    transition: all 0.2s ease;
  }
  
  .page-link:hover:not(.disabled):not(.active) {
    background: #f5f5f5;
  }
  
  .page-link.active {
    background: #333;
    color: white;
    border-color: #333;
  }
  
  .page-link.disabled {
    color: #999;
    cursor: not-allowed;
    opacity: 0.5;
  }
  
  .ellipsis {
    padding: 0 0.5rem;
    color: #999;
  }
</style>