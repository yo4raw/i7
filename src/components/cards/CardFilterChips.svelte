<script lang="ts">
  export type ChipOption = { value: string; label: string; activeClass?: string; activeStyle?: string };
  export type ChipGroup = { name: string; options: ChipOption[] };

  type Props = {
    label: string;
    options?: ChipOption[];
    /** グループ行表示 + グループ一括選択チップ（キャラクター用）。指定時は options より優先 */
    groups?: ChipGroup[];
    selected: Set<string>;
    onChange: (next: Set<string>) => void;
    /** details 折りたたみで表示する（選択肢が多いカテゴリ用） */
    collapsible?: boolean;
    /** URL 復元完了フラグ。true になった時点の選択有無で折りたたみの初期開閉を一度だけ決める */
    ready?: boolean;
  };

  let { label, options = [], groups = [], selected, onChange, collapsible = false, ready = true }: Props = $props();

  let open = $state(false);
  let openInitialized = false;
  $effect(() => {
    if (collapsible && ready && !openInitialized) {
      openInitialized = true;
      open = selected.size > 0;
    }
  });

  const chipBase =
    'inline-flex items-center rounded-full border px-3 py-1 text-sm cursor-pointer select-none transition-colors pressable';
  const chipOff =
    'bg-white border-gray-300 text-gray-700 hover:border-chrome-ink';
  // グループ一括選択チップ（IDOLiSH7 等）の OFF 状態。個別メンバーチップ（chipOff）と紛らわしくならないよう、
  // 枠線の濃さだけでなく背景も塗って区別する（border-dashed と合わせて二重に差をつける）
  const chipGroupOff =
    'bg-gray-100 border-gray-400 text-gray-600 hover:border-chrome-ink';

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  function isGroupOn(group: ChipGroup) {
    return group.options.every((o) => selected.has(o.value));
  }

  function toggleGroup(group: ChipGroup) {
    const next = new Set(selected);
    const allOn = isGroupOn(group);
    for (const o of group.options) {
      if (allOn) next.delete(o.value);
      else next.add(o.value);
    }
    onChange(next);
  }
</script>

{#snippet chip(option: ChipOption)}
  <button
    type="button"
    aria-pressed={selected.has(option.value)}
    onclick={() => toggle(option.value)}
    style={selected.has(option.value) ? (option.activeStyle ?? '') : ''}
    class="{chipBase} {selected.has(option.value)
      ? `${option.activeStyle ? '' : (option.activeClass ?? 'bg-chrome-ink border-chrome-ink')} text-white font-semibold`
      : chipOff}"
  >
    {selected.has(option.value) ? '✓ ' : ''}{option.label}
  </button>
{/snippet}

{#snippet body()}
  {#if groups.length > 0}
    <div class="space-y-1.5">
      {#each groups as group (group.name)}
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={isGroupOn(group)}
            onclick={() => toggleGroup(group)}
            class="{chipBase} border-dashed font-semibold {isGroupOn(group)
              ? 'bg-chrome-ink border-chrome-ink text-white'
              : chipGroupOff}"
          >
            {group.name}
          </button>
          {#each group.options as option (option.value)}
            {@render chip(option)}
          {/each}
        </div>
      {/each}
    </div>
  {:else}
    <div class="flex flex-wrap gap-1.5">
      {#each options as option (option.value)}
        {@render chip(option)}
      {/each}
    </div>
  {/if}
{/snippet}

{#if collapsible}
  <details bind:open class="rounded-lg border border-gray-200">
    <summary
      class="flex cursor-pointer list-none items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 [&::-webkit-details-marker]:hidden"
    >
      <span class="flex items-center gap-2">
        {label}
        {#if selected.size > 0}
          <span class="rounded-full bg-chrome-ink px-2 py-0.5 text-xs font-bold text-white">{selected.size}</span>
        {/if}
      </span>
      <span aria-hidden="true" class="text-gray-400">{open ? '▴' : '▾'}</span>
    </summary>
    <div class="border-t border-gray-200 px-3 py-2.5">
      {@render body()}
    </div>
  </details>
{:else}
  <div>
    <div class="mb-1 block text-xs font-medium text-gray-500">{label}</div>
    {@render body()}
  </div>
{/if}
