<script lang="ts">
  import { attrDonutSvg } from '../lib/donutChart';
  import { ATTR_HEX } from '../lib/constants';
  import type { Song } from '../lib/data/fetchSongsJson';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';
  import { songImageUrl, starsText } from '../lib/ui';
  import { refreshData } from '../lib/data/clientRefresh';
  import { fetchSongsJson, filterValidSongs, filterAllowedSongs } from '../lib/data/fetchSongsJson';

  type Props = {
    songs: Song[];
    categories: string[];
    base: string;
  };

  let { songs: initialSongs, categories, base }: Props = $props();

  let allSongs = $state<Song[]>(initialSongs);
  let text = $state('');
  let group = $state('');
  let stars = $state('');
  let sortBy = $state('default');
  let selectedSongIds = $state<Set<number>>(new Set());
  let ready = $state(false);

  $effect(() => {
    selectedSongIds = new Set(loadJson<number[]>(STORAGE_KEYS.SELECTED_SONGS, []));
    const params = new URLSearchParams(location.search);
    text = params.get('q') || '';
    group = params.get('group') || '';
    stars = params.get('stars') || '';
    sortBy = params.get('sort') || 'default';
    ready = true;

    refreshData(
      'songs',
      async () => filterAllowedSongs(filterValidSongs(await fetchSongsJson())),
      (fresh) => { allSongs = fresh as Song[]; }
    );
  });

  const filtered = $derived.by(() => {
    const t = text.toLowerCase();
    let result = allSongs.filter((s) => {
      if (t && !(s.song_name || '').toLowerCase().includes(t) && !(s.artist || '').toLowerCase().includes(t)) return false;
      if (group && s.category !== group) return false;
      if (stars && s.stars !== Number(stars)) return false;
      return true;
    });
    switch (sortBy) {
      case 'name-asc':
        result = [...result].sort((a, b) => (a.song_name || '').localeCompare(b.song_name || ''));
        break;
      case 'notes-desc':
        result = [...result].sort((a, b) => (b.notes_count || 0) - (a.notes_count || 0));
        break;
      case 'notes-asc':
        result = [...result].sort((a, b) => (a.notes_count || 0) - (b.notes_count || 0));
        break;
      case 'stars-desc':
        result = [...result].sort((a, b) => (b.stars || 0) - (a.stars || 0));
        break;
      case 'stars-asc':
        result = [...result].sort((a, b) => (a.stars || 0) - (b.stars || 0));
        break;
      case 'duration-desc':
        result = [...result].sort((a, b) => (b.duration || 0) - (a.duration || 0));
        break;
      case 'duration-asc':
        result = [...result].sort((a, b) => (a.duration || 0) - (b.duration || 0));
        break;
    }
    return result;
  });

  function saveSelected() {
    saveJson(STORAGE_KEYS.SELECTED_SONGS, [...selectedSongIds]);
  }

  function toggleSong(id: number, checked: boolean) {
    const next = new Set(selectedSongIds);
    if (checked) next.add(id); else next.delete(id);
    selectedSongIds = next;
    saveSelected();
  }

  const visibleIds = $derived(filtered.map((s) => s.id).filter((id): id is number => id != null));
  const checkedCount = $derived(visibleIds.filter((id) => selectedSongIds.has(id)).length);
  const selectAllChecked = $derived(visibleIds.length > 0 && checkedCount === visibleIds.length);
  const selectAllIndeterminate = $derived(checkedCount > 0 && checkedCount < visibleIds.length);

  function toggleAll(checked: boolean) {
    const next = new Set(selectedSongIds);
    for (const s of filtered) {
      if (s.id != null) {
        if (checked) next.add(s.id); else next.delete(s.id);
      }
    }
    selectedSongIds = next;
    saveSelected();
  }

  function updateUrl() {
    if (!ready) return;
    const params = new URLSearchParams();
    if (text) params.set('q', text);
    if (group) params.set('group', group);
    if (stars) params.set('stars', stars);
    if (sortBy !== 'default') params.set('sort', sortBy);
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  $effect(() => {
    void text; void group; void stars; void sortBy;
    updateUrl();
  });

  function dominantAttr(sr: number, br: number, mr: number): 'Shout' | 'Beat' | 'Melody' | null {
    if (!sr && !br && !mr) return null;
    if (sr >= br && sr >= mr) return 'Shout';
    if (br >= sr && br >= mr) return 'Beat';
    return 'Melody';
  }

  function rowBgRgba(attr: 'Shout' | 'Beat' | 'Melody' | null, opacity: number): string {
    if (!attr) return opacity < 0.1 ? 'transparent' : 'rgba(0,0,0,0.04)';
    const rgb = { Shout: '239,68,68', Beat: '34,197,94', Melody: '59,130,246' }[attr];
    return `rgba(${rgb},${opacity})`;
  }

  function borderFor(attr: 'Shout' | 'Beat' | 'Melody' | null): string {
    return attr ? ATTR_HEX[attr] : 'transparent';
  }

  function songBg(sr: number, br: number, mr: number, imgUrl: string, hover = false): string {
    const attr = dominantAttr(sr, br, mr);
    const c = rowBgRgba(attr, hover ? 0.12 : 0.06);
    return `linear-gradient(to right, rgba(255,255,255,1) 40%, rgba(255,255,255,0.92) 60%, rgba(255,255,255,0.55)), linear-gradient(${c}, ${c}), url(${imgUrl}) no-repeat right 25% / 50% auto`;
  }

  function mobileBg(sr: number, br: number, mr: number, imgUrl: string): string {
    const attr = dominantAttr(sr, br, mr);
    const c = rowBgRgba(attr, 0.06);
    return `linear-gradient(to right, rgba(255,255,255,1) 40%, rgba(255,255,255,0.65)), linear-gradient(${c}, ${c}), url(${imgUrl}) no-repeat right 25% / auto 500%`;
  }

  function reset() {
    text = '';
    group = '';
    stars = '';
    sortBy = 'default';
  }

  function go(id: number | undefined) {
    if (id != null) window.location.href = `${base}songs/${id}/`;
  }
</script>

<div class="bg-white rounded-lg shadow p-4 mb-6">
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
    <div>
      <label for="search-text" class="block text-xs font-medium text-gray-500 mb-1">曲名検索</label>
      <input
        id="search-text"
        type="text"
        placeholder="曲名/アーティスト"
        bind:value={text}
        class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
    </div>
    <div>
      <label for="search-group" class="block text-xs font-medium text-gray-500 mb-1">グループ</label>
      <select id="search-group" bind:value={group} class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
        <option value="">すべて</option>
        {#each categories as c}
          <option value={c}>{c}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="search-stars" class="block text-xs font-medium text-gray-500 mb-1">難易度（星）</label>
      <select id="search-stars" bind:value={stars} class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
        <option value="">すべて</option>
        <option value="1">★☆☆☆☆</option>
        <option value="2">★★☆☆☆</option>
        <option value="3">★★★☆☆</option>
        <option value="4">★★★★☆</option>
        <option value="5">★★★★★</option>
      </select>
    </div>
    <div>
      <label for="sort-by" class="block text-xs font-medium text-gray-500 mb-1">ソート</label>
      <select id="sort-by" bind:value={sortBy} class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
        <option value="default">デフォルト</option>
        <option value="name-asc">曲名（A→Z）</option>
        <option value="notes-desc">ノーツ数（多い順）</option>
        <option value="notes-asc">ノーツ数（少ない順）</option>
        <option value="stars-desc">難易度（高い順）</option>
        <option value="stars-asc">難易度（低い順）</option>
        <option value="duration-desc">秒数（長い順）</option>
        <option value="duration-asc">秒数（短い順）</option>
      </select>
    </div>
  </div>
  <div class="mt-3 flex items-center gap-3">
    <button type="button" class="text-sm text-indigo-600 hover:underline" onclick={reset}>条件リセット</button>
    <span class="text-sm text-gray-500">{filtered.length}曲を表示</span>
    {#if selectedSongIds.size > 0}
      <span class="text-sm text-indigo-600 font-medium">{selectedSongIds.size}曲を選択中</span>
    {/if}
  </div>
</div>

<div>
  <div class="hidden md:block overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-gray-100 text-left text-xs text-gray-500 uppercase">
          <th class="px-2 py-2 w-8">
            <input
              type="checkbox"
              title="すべて選択/解除"
              class="accent-indigo-500 cursor-pointer"
              checked={selectAllChecked}
              indeterminate={selectAllIndeterminate}
              onchange={(e) => toggleAll((e.currentTarget as HTMLInputElement).checked)}
            />
          </th>
          <th class="px-3 py-2">グループ</th>
          <th class="px-3 py-2">曲名</th>
          <th class="px-3 py-2">アーティスト</th>
          <th class="px-3 py-2">難易度</th>
          <th class="px-3 py-2 text-right">ノーツ数</th>
          <th class="px-3 py-2 text-right">秒数</th>
          <th class="px-3 py-2 w-48">属性比率</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        {#each filtered as song (song.id)}
          {@const sr = song.shout_ratio || 0}
          {@const br = song.beat_ratio || 0}
          {@const mr = song.melody_ratio || 0}
          {@const imgUrl = songImageUrl(song.id!)}
          {@const attr = dominantAttr(sr, br, mr)}
          {@const border = borderFor(attr)}
          {@const defaultBg = songBg(sr, br, mr, imgUrl)}
          {@const hoverBg = songBg(sr, br, mr, imgUrl, true)}
          <tr
            class="cursor-pointer"
            style="border-top:2px solid {border}; background: {defaultBg}"
            onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = hoverBg}
            onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = defaultBg}
            onclick={(e) => { if (!(e.target as HTMLElement).closest('.song-check')) go(song.id); }}
          >
            <td class="px-2 py-2 song-check">
              <input
                type="checkbox"
                class="accent-indigo-500 cursor-pointer"
                checked={song.id != null && selectedSongIds.has(song.id)}
                onchange={(e) => song.id != null && toggleSong(song.id, (e.currentTarget as HTMLInputElement).checked)}
                onclick={(e) => e.stopPropagation()}
              />
            </td>
            <td class="px-3 py-2 text-xs">{song.category || ''}</td>
            <td class="px-3 py-2 font-medium"><a href={`${base}songs/${song.id}/`} class="text-indigo-600 hover:underline" onclick={(e) => e.stopPropagation()}>{song.song_name || ''}</a></td>
            <td class="px-3 py-2">{song.artist || ''}</td>
            <td class="px-3 py-2 text-xs">
              <div>{song.difficulty || ''}</div>
              {#if song.stars}
                <div class="text-amber-400">{starsText(song.stars)}</div>
              {/if}
            </td>
            <td class="px-3 py-2 text-right">{(song.notes_count || 0).toLocaleString()}</td>
            <td class="px-3 py-2 text-right">{song.duration || '-'}</td>
            <td class="px-3 py-2">
              {#if sr || br || mr}
                <div class="flex items-center gap-2">
                  {@html attrDonutSvg(sr, br, mr, { sizeClass: 'w-10 h-10 flex-shrink-0' })}
                  <div class="text-[10px] text-gray-500 leading-tight">
                    <span style="color:{ATTR_HEX.Shout}">S:{Math.round(sr * 100)}%</span>
                    <span style="color:{ATTR_HEX.Beat}">B:{Math.round(br * 100)}%</span>
                    <span style="color:{ATTR_HEX.Melody}">M:{Math.round(mr * 100)}%</span>
                  </div>
                </div>
              {:else}
                <span class="text-gray-400 text-xs">-</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="md:hidden space-y-3">
    {#each filtered as song (song.id)}
      {@const sr = song.shout_ratio || 0}
      {@const br = song.beat_ratio || 0}
      {@const mr = song.melody_ratio || 0}
      {@const imgUrl = songImageUrl(song.id!)}
      {@const attr = dominantAttr(sr, br, mr)}
      {@const border = borderFor(attr)}
      <div
        class="rounded-lg shadow p-3 hover:shadow-md transition-shadow cursor-pointer"
        style="border-top:3px solid {border}; background: {mobileBg(sr, br, mr, imgUrl)}"
        onclick={(e) => { if (!(e.target as HTMLElement).closest('.song-check')) go(song.id); }}
        role="link"
        tabindex="0"
      >
        <div class="flex items-start gap-2">
          <div class="song-check pt-0.5">
            <input
              type="checkbox"
              class="accent-indigo-500 cursor-pointer"
              checked={song.id != null && selectedSongIds.has(song.id)}
              onchange={(e) => song.id != null && toggleSong(song.id, (e.currentTarget as HTMLInputElement).checked)}
              onclick={(e) => e.stopPropagation()}
            />
          </div>
          <div class="flex-1">
            <p class="font-medium text-sm text-indigo-600">{song.song_name || ''}</p>
            <p class="text-xs text-gray-500">{song.artist || ''} / {song.category || ''}</p>
            <div class="flex gap-3 mt-1 text-xs text-gray-600">
              <span>{song.difficulty || ''}{song.stars ? ' ' + starsText(song.stars) : ''}</span>
              <span>Notes: {(song.notes_count || 0).toLocaleString()}</span>
              <span>{song.duration || '-'}秒</span>
            </div>
            <div class="mt-2">
              {#if sr || br || mr}
                <div class="flex items-center gap-2">
                  {@html attrDonutSvg(sr, br, mr, { sizeClass: 'w-10 h-10 flex-shrink-0' })}
                  <div class="text-[10px] text-gray-500 leading-tight">
                    <span style="color:{ATTR_HEX.Shout}">S:{Math.round(sr * 100)}%</span>
                    <span style="color:{ATTR_HEX.Beat}">B:{Math.round(br * 100)}%</span>
                    <span style="color:{ATTR_HEX.Melody}">M:{Math.round(mr * 100)}%</span>
                  </div>
                </div>
              {:else}
                <span class="text-gray-400 text-xs">-</span>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>
