<script lang="ts">
  import type { PageData } from './$types';
  
  export let data: PageData;
</script>

<svelte:head>
  <title>アイドリッシュセブン 攻略ガイド</title>
  <meta name="description" content="アイドリッシュセブンのカード情報と攻略ガイド" />
</svelte:head>

<div class="container">
  <header>
    <h1>アイドリッシュセブン 攻略ガイド</h1>
    <p class="subtitle">カード情報データベース</p>
  </header>

  <section class="stats">
    <div class="stat-card">
      <h3>総カード数</h3>
      <p class="stat-value">{data.totalCards}</p>
    </div>
    <div class="stat-card">
      <h3>キャラクター数</h3>
      <p class="stat-value">{data.characterStats.length}</p>
    </div>
    <div class="stat-card">
      <h3>レアリティ種類</h3>
      <p class="stat-value">{data.rarityStats.length}</p>
    </div>
  </section>

  <section class="navigation">
    <h2>メニュー</h2>
    <nav>
      <a href="/cards" class="nav-link">
        <div class="nav-item">
          <h3>カード一覧</h3>
          <p>全カードの一覧を表示</p>
        </div>
      </a>
      <a href="/search" class="nav-link">
        <div class="nav-item">
          <h3>カード検索</h3>
          <p>条件を指定してカードを検索</p>
        </div>
      </a>
      <a href="/characters" class="nav-link">
        <div class="nav-item">
          <h3>キャラクター別</h3>
          <p>キャラクターごとのカード一覧</p>
        </div>
      </a>
      <a href="/rarity" class="nav-link">
        <div class="nav-item">
          <h3>レアリティ別</h3>
          <p>レアリティごとのカード一覧</p>
        </div>
      </a>
    </nav>
  </section>

  <section class="recent">
    <h2>最新カード</h2>
    <div class="card-grid">
      {#each data.recentCards as card}
        <a href="/card/{card.id}" class="card-link">
          <div class="card">
            <img src="/assets/cards/{card.id}.png" alt={card.cardname} loading="lazy" />
            <div class="card-info">
              <h4>{card.cardname}</h4>
              <p>{card.name}</p>
              <span class="rarity">{card.rarity}</span>
            </div>
          </div>
        </a>
      {/each}
    </div>
  </section>
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }

  header {
    text-align: center;
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 2.5rem;
    color: #333;
    margin-bottom: 0.5rem;
  }

  .subtitle {
    font-size: 1.2rem;
    color: #666;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background: #f5f5f5;
    padding: 1.5rem;
    border-radius: 8px;
    text-align: center;
  }

  .stat-card h3 {
    font-size: 1rem;
    color: #666;
    margin-bottom: 0.5rem;
  }

  .stat-value {
    font-size: 2.5rem;
    font-weight: bold;
    color: #333;
  }

  .navigation {
    margin-bottom: 2rem;
  }

  nav {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }

  .nav-link {
    text-decoration: none;
    color: inherit;
  }

  .nav-item {
    background: #fff;
    border: 1px solid #ddd;
    padding: 1.5rem;
    border-radius: 8px;
    transition: all 0.3s ease;
  }

  .nav-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .nav-item h3 {
    margin-bottom: 0.5rem;
    color: #333;
  }

  .nav-item p {
    color: #666;
    font-size: 0.9rem;
  }

  h2 {
    margin-bottom: 1rem;
    color: #333;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
  }

  .card-link {
    text-decoration: none;
    color: inherit;
  }

  .card {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
    transition: transform 0.3s ease;
  }

  .card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }

  .card img {
    width: 100%;
    height: auto;
    display: block;
  }

  .card-info {
    padding: 0.75rem;
  }

  .card-info h4 {
    font-size: 0.9rem;
    margin-bottom: 0.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-info p {
    font-size: 0.8rem;
    color: #666;
    margin-bottom: 0.5rem;
  }

  .rarity {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: #f0f0f0;
    border-radius: 4px;
    font-size: 0.75rem;
    color: #666;
  }
</style>