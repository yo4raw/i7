<script lang="ts">
  import '../app.css';
</script>

<div class="app">
  <header class="navbar">
    <nav>
      <a href="/" class="logo">i7 攻略ガイド</a>
      <ul class="nav-links">
        <li><a href="/cards">カード一覧</a></li>
        <li><a href="/search">検索</a></li>
        <li><a href="/characters">キャラクター</a></li>
        <li><a href="/rarity">レアリティ</a></li>
      </ul>
    </nav>
  </header>
  
  <main>
    <slot />
  </main>
  
  <footer>
    <p>&copy; 2024 アイドリッシュセブン 攻略ガイド</p>
  </footer>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  
  .navbar {
    background: #333;
    color: white;
    padding: 1rem 0;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  nav {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .logo {
    font-size: 1.5rem;
    font-weight: bold;
    color: white;
    text-decoration: none;
  }
  
  .nav-links {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0;
    gap: 2rem;
  }
  
  .nav-links a {
    color: white;
    text-decoration: none;
    transition: opacity 0.3s ease;
  }
  
  .nav-links a:hover {
    opacity: 0.8;
  }
  
  main {
    flex: 1;
    background: #f5f5f5;
  }
  
  footer {
    background: #333;
    color: white;
    text-align: center;
    padding: 2rem;
    margin-top: auto;
  }
  
  footer p {
    margin: 0;
  }
  
  @media (max-width: 768px) {
    nav {
      flex-direction: column;
      gap: 1rem;
    }
    
    .nav-links {
      gap: 1rem;
      font-size: 0.9rem;
    }
  }
</style>