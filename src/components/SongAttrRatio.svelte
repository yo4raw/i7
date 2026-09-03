<script lang="ts">
  import type { Song } from '../lib/data/fetchSongsJson';
  import { ATTR_HEX } from '../lib/constants';
  import { attrDonutSvg } from '../lib/donutChart';

  type Props = {
    song: Song;
    /** ドーナツのサイズ Tailwind クラス */
    sizeClass?: string;
  };
  let { song, sizeClass = 'size-10 flex-shrink-0' }: Props = $props();

  const pct = (v: number | null | undefined): number => Math.round((v || 0) * 100);
</script>

<span class="flex items-center gap-2">
  {@html attrDonutSvg(song.shout_ratio || 0, song.beat_ratio || 0, song.melody_ratio || 0, { sizeClass })}
  <span class="flex gap-2 text-xs tabular-nums whitespace-nowrap">
    <span style="color:{ATTR_HEX.Shout}">Shout {pct(song.shout_ratio)}%</span>
    <span style="color:{ATTR_HEX.Beat}">Beat {pct(song.beat_ratio)}%</span>
    <span style="color:{ATTR_HEX.Melody}">Melody {pct(song.melody_ratio)}%</span>
  </span>
</span>
