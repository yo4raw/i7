<script lang="ts">
  import type { PageData } from './$types';
  
  export let data: PageData;
  
  const attributeNames = ['', 'Shout', 'Beat', 'Melody'];
</script>

<svelte:head>
  <title>{data.card.cardname} | アイドリッシュセブン 攻略ガイド</title>
</svelte:head>

<div class="container">
  <nav class="breadcrumb">
    <a href="/">ホーム</a> /
    <a href="/cards">カード一覧</a> /
    <span>{data.card.cardname}</span>
  </nav>
  
  <div class="card-detail">
    <div class="card-image">
      <img src="/assets/cards/{data.card.id}.png" alt={data.card.cardname} />
    </div>
    
    <div class="card-info">
      <h1>{data.card.cardname}</h1>
      
      <div class="basic-info">
        <div class="info-row">
          <span class="label">キャラクター:</span>
          <span class="value">{data.card.name}</span>
        </div>
        {#if data.card.name_other}
          <div class="info-row">
            <span class="label">別名:</span>
            <span class="value">{data.card.name_other}</span>
          </div>
        {/if}
        <div class="info-row">
          <span class="label">グループ:</span>
          <span class="value">{data.card.groupname}</span>
        </div>
        <div class="info-row">
          <span class="label">レアリティ:</span>
          <span class="value rarity">{data.card.rarity}</span>
        </div>
        <div class="info-row">
          <span class="label">入手方法:</span>
          <span class="value">{data.card.get_type}</span>
        </div>
        <div class="info-row">
          <span class="label">属性:</span>
          <span class="value attribute-{data.card.attribute}">
            {attributeNames[data.card.attribute] || '不明'}
          </span>
        </div>
      </div>
      
      {#if data.card.story}
        <div class="story">
          <h2>ストーリー</h2>
          <p>{data.card.story}</p>
        </div>
      {/if}
    </div>
  </div>
  
  <div class="stats-section">
    <h2>ステータス</h2>
    <div class="stats-grid">
      <div class="stat-item">
        <h3>Shout</h3>
        <div class="stat-values">
          <div>
            <span class="stat-label">最小:</span>
            <span class="stat-value">{data.card.shout_min}</span>
          </div>
          <div>
            <span class="stat-label">最大:</span>
            <span class="stat-value">{data.card.shout_max}</span>
          </div>
        </div>
      </div>
      <div class="stat-item">
        <h3>Beat</h3>
        <div class="stat-values">
          <div>
            <span class="stat-label">最小:</span>
            <span class="stat-value">{data.card.beat_min}</span>
          </div>
          <div>
            <span class="stat-label">最大:</span>
            <span class="stat-value">{data.card.beat_max}</span>
          </div>
        </div>
      </div>
      <div class="stat-item">
        <h3>Melody</h3>
        <div class="stat-values">
          <div>
            <span class="stat-label">最小:</span>
            <span class="stat-value">{data.card.melody_min}</span>
          </div>
          <div>
            <span class="stat-label">最大:</span>
            <span class="stat-value">{data.card.melody_max}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <div class="skills-section">
    <h2>スキル</h2>
    
    {#if data.card.ap_skill_name}
      <div class="skill-block">
        <h3>APスキル: {data.card.ap_skill_name}</h3>
        <p>タイプ: {data.card.ap_skill_type}</p>
        <p>発動条件: {data.card.ap_skill_req}</p>
        
        {#if data.skillDetails.length > 0}
          <table class="skill-details">
            <thead>
              <tr>
                <th>レベル</th>
                <th>回数</th>
                <th>パーセント</th>
                <th>効果値</th>
                <th>発動率</th>
              </tr>
            </thead>
            <tbody>
              {#each data.skillDetails as detail}
                <tr>
                  <td>{detail.skill_level}</td>
                  <td>{detail.count}</td>
                  <td>{detail.per}%</td>
                  <td>{detail.value}</td>
                  <td>{detail.rate}%</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    {/if}
    
    {#if data.card.ct_skill > 0}
      <div class="skill-block">
        <h3>CTスキル</h3>
        <p>効果: {data.card.ct_skill}</p>
      </div>
    {/if}
    
    {#if data.card.sp_time > 0}
      <div class="skill-block">
        <h3>SPスキル</h3>
        <p>時間: {data.card.sp_time}</p>
        <p>効果値: {data.card.sp_value}</p>
      </div>
    {/if}
  </div>
  
  {#if data.card.year}
    <div class="release-info">
      <h2>リリース情報</h2>
      <p>
        {data.card.year}年{data.card.month}月{data.card.day}日
        {#if data.card.event}
          - {data.card.event}
        {/if}
      </p>
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }
  
  .breadcrumb {
    margin-bottom: 2rem;
    font-size: 0.9rem;
    color: #666;
  }
  
  .breadcrumb a {
    color: #666;
    text-decoration: none;
  }
  
  .breadcrumb a:hover {
    text-decoration: underline;
  }
  
  .card-detail {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 2rem;
    margin-bottom: 3rem;
  }
  
  .card-image img {
    width: 100%;
    height: auto;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  
  .card-info h1 {
    font-size: 2rem;
    margin-bottom: 1.5rem;
  }
  
  .basic-info {
    margin-bottom: 2rem;
  }
  
  .info-row {
    display: flex;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  
  .label {
    font-weight: bold;
    margin-right: 1rem;
    min-width: 120px;
  }
  
  .value {
    color: #666;
  }
  
  .rarity {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: #f0f0f0;
    border-radius: 4px;
    color: #333;
  }
  
  .attribute-1 { color: #ff6b6b; }
  .attribute-2 { color: #4ecdc4; }
  .attribute-3 { color: #ffe66d; }
  
  .story {
    margin-top: 2rem;
  }
  
  .story h2 {
    font-size: 1.5rem;
    margin-bottom: 1rem;
  }
  
  .story p {
    line-height: 1.6;
    color: #666;
  }
  
  .stats-section,
  .skills-section,
  .release-info {
    margin-bottom: 3rem;
  }
  
  h2 {
    font-size: 1.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 2px solid #eee;
    padding-bottom: 0.5rem;
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
  }
  
  .stat-item {
    background: #f8f8f8;
    padding: 1.5rem;
    border-radius: 8px;
  }
  
  .stat-item h3 {
    margin-bottom: 1rem;
    color: #333;
  }
  
  .stat-values {
    display: flex;
    justify-content: space-between;
  }
  
  .stat-label {
    font-size: 0.9rem;
    color: #666;
  }
  
  .stat-value {
    font-size: 1.2rem;
    font-weight: bold;
    color: #333;
  }
  
  .skill-block {
    background: #f8f8f8;
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }
  
  .skill-block h3 {
    margin-bottom: 1rem;
    color: #333;
  }
  
  .skill-block p {
    margin-bottom: 0.5rem;
    color: #666;
  }
  
  .skill-details {
    width: 100%;
    margin-top: 1rem;
    border-collapse: collapse;
  }
  
  .skill-details th,
  .skill-details td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #ddd;
  }
  
  .skill-details th {
    background: #eee;
    font-weight: bold;
  }
  
  .skill-details tr:hover {
    background: #f5f5f5;
  }
  
  .release-info p {
    font-size: 1.1rem;
    color: #666;
  }
  
  @media (max-width: 768px) {
    .card-detail {
      grid-template-columns: 1fr;
    }
    
    .stat-values {
      flex-direction: column;
      gap: 0.5rem;
    }
  }
</style>