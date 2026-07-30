<script lang="ts">
  import type { Song } from '../lib/data/fetchSongsJson';
  import { getEventSongIds } from '../lib/data/fetchSongsJson';
  import { STORAGE_KEYS, loadJson } from '../lib/storage';

  type Props = {
    songs: Song[];
    /** 選択中の曲 ID。null は未選択 */
    value: number | null;
    onChange?: (id: number | null) => void;
    class?: string;
    /** 空 option のラベル。null を渡すと空 option を出さない */
    placeholder?: string | null;
    id?: string;
  };
  let {
    songs,
    value = $bindable(),
    onChange,
    class: className = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chrome-ink',
    placeholder = '楽曲を選択',
    id,
  }: Props = $props();

  /** 1曲分の表示ラベル: 曲名 (難易度) - N秒 / Mノーツ */
  function label(s: Song): string {
    return `${s.song_name} (${s.difficulty || ''}) - ${s.duration || '?'}秒 / ${s.notes_count || '?'}ノーツ`;
  }

  // イベント対象楽曲（config 配列順を維持）
  const eventSongs = $derived.by(() => {
    const byId = new Map(songs.filter((s) => s.id !== null && s.id !== undefined).map((s) => [s.id as number, s]));
    return getEventSongIds()
      .map((eid) => byId.get(eid))
      .filter((s): s is Song => s !== null && s !== undefined);
  });

  // 選択中の曲（i7_selected_songs・秒数順）
  const pickedSongs = $derived.by(() => {
    const picked = new Set(loadJson<number[]>(STORAGE_KEYS.SELECTED_SONGS, []));
    return songs
      .filter((s) => s.id !== null && s.id !== undefined && picked.has(s.id))
      .toSorted((a, b) => (a.duration || 0) - (b.duration || 0));
  });

  // カテゴリ別
  const categorizedSongs = $derived.by(() => {
    const groups = new Map<string, Song[]>();
    for (const s of songs) {
      const cat = s.category || 'その他';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(s);
    }
    return [...groups];
  });

  function handleChange(e: Event) {
    const raw = (e.currentTarget as HTMLSelectElement).value;
    const next = raw === '' ? null : Number(raw);
    value = Number.isNaN(next as number) ? null : next;
    onChange?.(value);
  }
</script>

<select
  {id}
  class={className}
  value={value != null ? String(value) : ''}
  onchange={handleChange}
>
  {#if placeholder != null}
    <option value="">{placeholder}</option>
  {/if}
  {#if eventSongs.length > 0}
    <optgroup label="イベント対象楽曲">
      {#each eventSongs as s (s.id)}
        <option value={String(s.id)}>{label(s)}</option>
      {/each}
    </optgroup>
  {/if}
  {#if pickedSongs.length > 0}
    <optgroup label={`選択中の曲（${pickedSongs.length}曲・秒数順）`}>
      {#each pickedSongs as s (s.id)}
        <option value={String(s.id)}>{label(s)}</option>
      {/each}
    </optgroup>
  {/if}
  {#each categorizedSongs as [cat, group] (cat)}
    <optgroup label={cat}>
      {#each group as s (s.id)}
        <option value={String(s.id)}>{label(s)}</option>
      {/each}
    </optgroup>
  {/each}
</select>
