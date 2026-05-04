<script lang="ts">
  import type { CardListItem } from '../lib/cardListData';
  import { CHARACTERS, RARITIES, ATTRIBUTES } from '../lib/constants';
  import { buildLiveTierMap, type EventForBonus } from '../lib/data/eventBonusTiers';
  import { refreshData } from '../lib/data/clientRefresh';
  import { fetchCardsJson } from '../lib/data/fetchCardsJson';
  import CardTableRow from './cards/CardTableRow.svelte';
  import CardMobileCard from './cards/CardMobileCard.svelte';

  type Props = {
    cards: CardListItem[];
    events: EventForBonus[];
    base: string;
    thumbUrl: string;
    pageSize?: number;
    skillTypes: string[];
  };

  let { cards: initialCards, events, base, thumbUrl, pageSize = 100, skillTypes }: Props = $props();

  let allCards = $state<CardListItem[]>(initialCards);
  const tierMap = $derived(buildLiveTierMap(events));
  const hasAnyLive = $derived(tierMap.size > 0);

  let text = $state('');
  let raritySet = $state<Set<string>>(new Set());
  let attributeSet = $state<Set<string>>(new Set());
  let characterSet = $state<Set<string>>(new Set());
  let skillSet = $state<Set<string>>(new Set());
  let bonusSet = $state<Set<string>>(new Set());
  let sortBy = $state('id-desc');
  let visiblePages = $state(1);
  let currentVisiblePage = $state(1);
  let ready = $state(false);

  const filtered = $derived.by(() => {
    const t = text.toLowerCase();
    let result = allCards.filter((card) => {
      if (t && !(card.cardname || '').toLowerCase().includes(t) && !(card.name || '').toLowerCase().includes(t)) return false;
      if (raritySet.size && !raritySet.has(card.rarity)) return false;
      if (attributeSet.size && !attributeSet.has(card.attribute)) return false;
      if (characterSet.size && !characterSet.has(card.name)) return false;
      if (skillSet.size && !skillSet.has(card.ap_skill_type || '')) return false;
      if (bonusSet.size) {
        const tier = tierMap.get(card.ID);
        if (!tier || !bonusSet.has(tier)) return false;
      }
      return true;
    });
    switch (sortBy) {
      case 'id-asc':
        result = result.sort((a, b) => a.ID - b.ID);
        break;
      case 'stats-desc':
        result = result.sort((a, b) => ((b.shout_max || 0) + (b.beat_max || 0) + (b.melody_max || 0)) - ((a.shout_max || 0) + (a.beat_max || 0) + (a.melody_max || 0)));
        break;
      case 'stats-asc':
        result = result.sort((a, b) => ((a.shout_max || 0) + (a.beat_max || 0) + (a.melody_max || 0)) - ((b.shout_max || 0) + (b.beat_max || 0) + (b.melody_max || 0)));
        break;
      default:
        result = result.sort((a, b) => b.ID - a.ID);
    }
    return result;
  });

  const visible = $derived(filtered.slice(0, visiblePages * pageSize));
  const hasMore = $derived(visible.length < filtered.length);

  const resultCountText = $derived(
    filtered.length === visible.length
      ? `全${filtered.length}件を表示`
      : `${filtered.length}件中 ${visible.length}件を表示`
  );

  function toggleSet(set: Set<string>, value: string) {
    if (set.has(value)) set.delete(value); else set.add(value);
    return new Set(set);
  }

  function updateUrlParams() {
    const params = new URLSearchParams();
    if (text) params.set('q', text);
    if (raritySet.size) params.set('rarity', [...raritySet].join(','));
    if (attributeSet.size) params.set('attr', [...attributeSet].join(','));
    if (characterSet.size) params.set('char', [...characterSet].join(','));
    if (skillSet.size) params.set('skill', [...skillSet].join(','));
    if (hasAnyLive && bonusSet.size) params.set('bonus', [...bonusSet].join(','));
    if (sortBy !== 'id-desc') params.set('sort', sortBy);
    if (currentVisiblePage > 1) params.set('page', String(currentVisiblePage));

    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  function restoreFromUrl() {
    const params = new URLSearchParams(location.search);
    text = params.get('q') || '';
    raritySet = new Set(params.get('rarity')?.split(',').filter(Boolean) ?? []);
    attributeSet = new Set(params.get('attr')?.split(',').filter(Boolean) ?? []);
    characterSet = new Set(params.get('char')?.split(',').filter(Boolean) ?? []);
    skillSet = new Set(params.get('skill')?.split(',').filter(Boolean) ?? []);
    bonusSet = new Set(params.get('bonus')?.split(',').filter(Boolean) ?? []);
    sortBy = params.get('sort') || 'id-desc';
    const pageParam = params.get('page');
    const target = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
    visiblePages = target;
    currentVisiblePage = target;
  }

  function filterByName(name: string) {
    text = name;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reset() {
    text = '';
    raritySet = new Set();
    attributeSet = new Set();
    characterSet = new Set();
    skillSet = new Set();
    bonusSet = new Set();
    sortBy = 'id-desc';
    visiblePages = 1;
    currentVisiblePage = 1;
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput(v: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { text = v; }, 300);
  }

  let scrollRafId = 0;
  function onScroll() {
    cancelAnimationFrame(scrollRafId);
    scrollRafId = requestAnimationFrame(() => {
      const markers = document.querySelectorAll<HTMLElement>('[data-page-marker]');
      let page = 1;
      for (const marker of markers) {
        if (marker.getBoundingClientRect().top <= window.innerHeight * 0.5) {
          page = Number(marker.dataset.pageMarker);
        }
      }
      if (page !== currentVisiblePage) currentVisiblePage = page;
    });
  }

  let sentinelEl: HTMLElement | null = null;
  let observer: IntersectionObserver | null = null;

  $effect(() => {
    restoreFromUrl();
    ready = true;

    observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore) {
        visiblePages++;
      }
    }, { rootMargin: '400px' });
    if (sentinelEl) observer.observe(sentinelEl);

    window.addEventListener('scroll', onScroll, { passive: true });

    refreshData('cards', fetchCardsJson, (fresh) => {
      allCards = fresh as CardListItem[];
    });

    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  });

  // フィルタが変わったら URL 更新
  $effect(() => {
    if (!ready) return;
    // ダーティ参照: フィルタ/ソート/ページ
    void text; void raritySet; void attributeSet; void characterSet;
    void skillSet; void bonusSet; void sortBy; void currentVisiblePage;
    updateUrlParams();
  });

  // フィルタ変更時にページを先頭に戻す
  let prevFilterKey = '';
  $effect(() => {
    const key = JSON.stringify([text, [...raritySet], [...attributeSet], [...characterSet], [...skillSet], [...bonusSet], sortBy]);
    if (prevFilterKey && prevFilterKey !== key) {
      visiblePages = 1;
      currentVisiblePage = 1;
    }
    prevFilterKey = key;
  });
</script>

<div class="bg-white rounded-lg shadow p-4 mb-6">
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3">
    <div>
      <label for="search-text" class="block text-xs font-medium text-gray-500 mb-1">名前検索</label>
      <input
        type="text"
        id="search-text"
        placeholder="衣装名/キャラ名"
        value={text}
        oninput={(e) => onSearchInput((e.currentTarget as HTMLInputElement).value)}
        class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
    </div>
    <div>
      <label for="search-rarity" class="block text-xs font-medium text-gray-500 mb-1">レアリティ</label>
      <select
        id="search-rarity"
        multiple
        class="w-full border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 h-[4.5rem]"
        onchange={(e) => {
          raritySet = new Set(Array.from((e.currentTarget as HTMLSelectElement).selectedOptions).map((o) => o.value));
        }}
      >
        {#each RARITIES as r}
          <option value={r} selected={raritySet.has(r)}>{r}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="search-attribute" class="block text-xs font-medium text-gray-500 mb-1">属性</label>
      <select
        id="search-attribute"
        multiple
        class="w-full border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 h-[4.5rem]"
        onchange={(e) => {
          attributeSet = new Set(Array.from((e.currentTarget as HTMLSelectElement).selectedOptions).map((o) => o.value));
        }}
      >
        {#each ATTRIBUTES as a}
          <option value={a.label} selected={attributeSet.has(a.label)}>{a.label}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="search-character" class="block text-xs font-medium text-gray-500 mb-1">キャラクター</label>
      <select
        id="search-character"
        multiple
        class="w-full border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 h-[4.5rem]"
        onchange={(e) => {
          characterSet = new Set(Array.from((e.currentTarget as HTMLSelectElement).selectedOptions).map((o) => o.value));
        }}
      >
        {#each CHARACTERS as c}
          <option value={c} selected={characterSet.has(c)}>{c}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="search-skill" class="block text-xs font-medium text-gray-500 mb-1">スキルタイプ</label>
      <select
        id="search-skill"
        multiple
        class="w-full border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 h-[4.5rem]"
        onchange={(e) => {
          skillSet = new Set(Array.from((e.currentTarget as HTMLSelectElement).selectedOptions).map((o) => o.value));
        }}
      >
        {#each skillTypes as s}
          <option value={s} selected={skillSet.has(s)}>{s}</option>
        {/each}
      </select>
    </div>
    {#if hasAnyLive}
      <div>
        <label for="search-bonus" class="block text-xs font-medium text-gray-500 mb-1">特効</label>
        <select
          id="search-bonus"
          multiple
          class="w-full border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 h-[4.5rem]"
          onchange={(e) => {
            bonusSet = new Set(Array.from((e.currentTarget as HTMLSelectElement).selectedOptions).map((o) => o.value));
          }}
        >
          <option value="gold" selected={bonusSet.has('gold')}>金特効</option>
          <option value="silver" selected={bonusSet.has('silver')}>銀特効</option>
          <option value="bronze" selected={bonusSet.has('bronze')}>銅特効</option>
        </select>
      </div>
    {/if}
    <div>
      <label for="sort-by" class="block text-xs font-medium text-gray-500 mb-1">ソート</label>
      <select
        id="sort-by"
        bind:value={sortBy}
        class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        <option value="id-desc">ID降順（新しい順）</option>
        <option value="id-asc">ID昇順（古い順）</option>
        <option value="stats-desc">ステータス合計（高い順）</option>
        <option value="stats-asc">ステータス合計（低い順）</option>
      </select>
    </div>
  </div>
  <div class="mt-3 flex items-center gap-3">
    <button type="button" class="text-sm text-indigo-600 hover:underline" onclick={reset}>条件リセット</button>
    <span class="text-sm text-gray-500">{resultCountText}</span>
  </div>
</div>

<div>
  <div class="hidden md:block overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-gray-100 text-left text-xs text-gray-500 uppercase">
          <th class="px-3 py-2 w-16">画像</th>
          <th class="px-3 py-2">ID</th>
          <th class="px-3 py-2">衣装名</th>
          <th class="px-3 py-2">キャラ</th>
          <th class="px-3 py-2">レア</th>
          <th class="px-3 py-2">属性</th>
          {#if hasAnyLive}
            <th class="px-3 py-2">特効</th>
          {/if}
          <th class="px-3 py-2 w-20">属性比率</th>
          <th class="px-3 py-2 text-right">Shout</th>
          <th class="px-3 py-2 text-right">Beat</th>
          <th class="px-3 py-2 text-right">Melody</th>
          <th class="px-3 py-2">スキル</th>
          <th class="px-3 py-2 w-28 text-center">所持数</th>
        </tr>
      </thead>
      <tbody>
        {#each visible as card, idx (card.ID)}
          <CardTableRow
            {card}
            {base}
            {thumbUrl}
            bonusTier={tierMap.get(card.ID)}
            enableNameFilter
            showBonusCell={hasAnyLive}
            pageMarker={idx % pageSize === 0 ? Math.floor(idx / pageSize) + 1 : null}
            onFilterByName={filterByName}
          />
        {/each}
      </tbody>
    </table>
  </div>
  <div class="md:hidden space-y-3">
    {#each visible as card, idx (card.ID)}
      <CardMobileCard
        {card}
        {base}
        {thumbUrl}
        bonusTier={tierMap.get(card.ID)}
        enableNameFilter
        pageMarker={idx % pageSize === 0 ? Math.floor(idx / pageSize) + 1 : null}
        onFilterByName={filterByName}
      />
    {/each}
  </div>
</div>

<div bind:this={sentinelEl} class="mt-6 flex justify-center py-8">
  {#if hasMore}
    <span class="text-sm text-gray-400">
      <svg class="animate-spin inline-block h-4 w-4 mr-1 align-text-bottom text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
      読み込み中…
    </span>
  {:else if filtered.length > 0}
    <span class="text-sm text-gray-400">すべての衣装を表示しました</span>
  {/if}
</div>
