<script lang="ts">
  import { CHARACTER_GROUPS, characterColor } from '../lib/constants';

  type Props = { height?: number };
  let { height = 3 }: Props = $props();
</script>

<!--
  16 色バー。ユニットで区切るのは装飾ではなく、ピンク 3 色・緑 2 色・紺 2 色を
  含む 16 色を並び位置で判別可能にするための構造 (ADR 0047)。
  純粋な識別記号なので支援技術からは隠す。
-->
<div
  class="flex w-full gap-2"
  style="height:{height}px"
  data-testid="character-color-bar"
  aria-hidden="true"
>
  {#each CHARACTER_GROUPS as group (group.name)}
    <div class="flex flex-1 gap-px" style="flex-grow:{group.members.length}">
      {#each group.members as member (member)}
        <span
          class="flex-1"
          style="background-color:{characterColor(member)}"
          data-testid="character-color-segment"
          data-character={member}
        ></span>
      {/each}
    </div>
  {/each}
</div>
