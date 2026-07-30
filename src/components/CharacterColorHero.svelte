<script lang="ts">
  import { CHARACTER_GROUPS, SITE_NAME, characterColor } from '../lib/constants';

  type Props = { base: string };
  let { base }: Props = $props();
</script>

<!-- 大判の 16 色バー。ヘッダーの 3px 線と同じ並びを大きなスケールで反復する (ADR 0047) -->
<section class="rounded-card overflow-hidden" style="background-color:var(--color-chrome-ink)">
  <div class="px-5 pt-5 pb-4">
    <h1 class="text-display text-2xl font-bold text-white">{SITE_NAME}</h1>
    <p class="mt-1.5 text-sm text-gray-300">
      アイドリッシュセブンの衣装・楽曲・イベントを調べて、デッキのスコアを試算できます。
    </p>
  </div>
  <!--
    モバイルはユニットごとに 1 行を占有させる（横並びのままだと 390px 幅で 1 セグメント
    16.8px となり WCAG 2.2 SC 2.5.8 の 24×24px を満たせない。セグメントは 1px 間隔で
    隣接するため Spacing 例外も使えない）。縦積みなら最小の IDOLiSH7 でも 7 分割で
    十分な幅が残る。sm 以上は従来どおり 4 ユニットを横並びにする。
  -->
  <div class="flex flex-col gap-3 px-5 pb-5 sm:flex-row">
    {#each CHARACTER_GROUPS as group (group.name)}
      <div class="unit min-w-0" style="--unit-grow:{group.members.length}">
        <div class="flex gap-px">
          {#each group.members as member (member)}
            <a
              href={`${base}cards/?char=${encodeURIComponent(member)}`}
              class="h-9 flex-1 pressable transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style="background-color:{characterColor(member)}"
              aria-label={`${member}の衣装一覧`}
            ></a>
          {/each}
        </div>
        <div class="mt-1.5 truncate text-[10px] tracking-wide text-gray-400">{group.name}</div>
      </div>
    {/each}
  </div>
</section>

<style>
  /* 横並びのときだけメンバー数に比例して幅を配分する（縦積み時は高さが伸びるため無効） */
  @media (min-width: 40rem) {
    .unit {
      flex-grow: var(--unit-grow);
      flex-basis: 0;
    }
  }
</style>
