<script lang="ts">
  import { RARITY_BADGE_CLASSES } from '../../lib/constants';

  let { rarity, sizeClass, fallbackLabel = '' }: {
    rarity: string | null | undefined;
    /** px/py/text サイズ系クラス（呼び出し元の既存表示を踏襲） */
    sizeClass: string;
    fallbackLabel?: string;
  } = $props();
</script>

<span class="{sizeClass} font-bold text-white rounded {RARITY_BADGE_CLASSES[rarity || ''] || 'bg-gray-300'}">
  {rarity || fallbackLabel}
</span>
