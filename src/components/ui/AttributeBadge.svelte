<script lang="ts">
  import { ATTR_BADGE_BG } from '../../lib/constants';

  let { attribute, sizeClass, fallbackLabel = '?' }: {
    attribute: string | null | undefined;
    /** px/py/text サイズ系クラス（呼び出し元の既存表示を踏襲） */
    sizeClass: string;
    fallbackLabel?: string;
  } = $props();
</script>

<span class="{sizeClass} font-bold text-white rounded {ATTR_BADGE_BG[attribute || ''] || 'bg-gray-300'}">
  {attribute || fallbackLabel}
</span>
