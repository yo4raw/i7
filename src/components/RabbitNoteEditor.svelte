<script lang="ts">
  import { onMount } from 'svelte';
  import { CHARACTER_GROUPS, characterColor } from '../lib/constants';
  import { loadRabbitNotes, saveRabbitNotes, type RabbitNoteMap } from '../lib/data/rabbitNote';
  import ModalDialog from './ui/ModalDialog.svelte';

  // oxlint-disable-next-line no-unassigned-vars -- Svelte の bind:this 代入を静的解析できず誤検知
  let dialog: ModalDialog | undefined;

  const ATTRS = [
    { key: 'shout', label: 'Shout', color: 'text-red-600', border: 'focus:border-red-400' },
    { key: 'beat', label: 'Beat', color: 'text-green-600', border: 'focus:border-green-400' },
    { key: 'melody', label: 'Melody', color: 'text-blue-600', border: 'focus:border-blue-400' },
  ] as const;

  let data = $state<RabbitNoteMap>({});
  let feedback = $state('');
  let feedbackVisible = $state(false);

  $effect(() => {
    data = loadRabbitNotes();
  });

  // 同期層が別端末のラビットノートを取り込んだ通知。DOM イベント名の文字列だけを購読し、
  // src/lib/sync/ からは何も import しない（同期層を削除しても今日と同じ挙動になる）
  onMount(() => {
    const onSyncApplied = () => {
      data = loadRabbitNotes();
    };
    window.addEventListener('i7:sync-applied', onSyncApplied);
    return () => window.removeEventListener('i7:sync-applied', onSyncApplied);
  });

  function getValue(member: string, attr: 'shout' | 'beat' | 'melody'): number {
    return data[member]?.[attr] || 0;
  }

  function setValue(member: string, attr: 'shout' | 'beat' | 'melody', val: number) {
    const entry = data[member] ?? { shout: 0, beat: 0, melody: 0 };
    data[member] = { ...entry, [attr]: val };
  }

  function clean(map: RabbitNoteMap): RabbitNoteMap {
    const cleaned: RabbitNoteMap = {};
    for (const [k, v] of Object.entries(map)) {
      if (v.shout || v.beat || v.melody) cleaned[k] = v;
    }
    return cleaned;
  }

  function showFeedback(msg: string) {
    feedback = msg;
    feedbackVisible = true;
    setTimeout(() => { feedbackVisible = false; }, 2000);
  }

  function onSave() {
    const cleaned = clean(data);
    saveRabbitNotes(cleaned);
    data = cleaned;
    showFeedback('保存しました');
  }

  async function onClear() {
    const ok = await dialog?.confirm({
      title: '全てのラビットノート値をクリアしますか？',
      message: '登録済みの値がすべて失われます。この操作は取り消せません。',
      confirmLabel: 'クリアする',
      danger: true,
    });
    if (!ok) return;
    saveRabbitNotes({});
    data = {};
    showFeedback('クリアしました');
  }
</script>

<div>
  {#each CHARACTER_GROUPS as group}
    <section class="surface-card relative mb-4 overflow-hidden">
      <span class="absolute left-0 top-0 bottom-0 flex w-1 flex-col" aria-hidden="true">
        {#each group.members as member (member)}
          <span class="flex-1" style="background-color:{characterColor(member)}"></span>
        {/each}
      </span>
      <h2 class="text-lg font-bold px-4 pt-4 pb-2">{group.name}</h2>
      <div class="px-4 pb-4 space-y-3">
        {#each group.members as member}
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span class="font-medium text-sm w-28 shrink-0">{member}</span>
            <div class="flex gap-2 flex-1">
              {#each ATTRS as attr}
                {@const val = getValue(member, attr.key)}
                <div class="flex items-center gap-1 flex-1">
                  <label class="text-xs font-bold {attr.color} w-7 shrink-0" for="rn-{member}-{attr.key}">
                    {attr.label.charAt(0)}
                  </label>
                  <input
                    id="rn-{member}-{attr.key}"
                    type="number"
                    min="0"
                    max="99999"
                    value={val || ''}
                    class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right {attr.border} focus:outline-none focus:ring-1"
                    placeholder="0"
                    onchange={(e) => setValue(member, attr.key, parseInt((e.currentTarget as HTMLInputElement).value, 10) || 0)}
                  />
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/each}
</div>

<div class="mt-6 flex gap-3">
  <button type="button" class="px-5 py-2.5 bg-chrome-ink text-white rounded-lg hover:bg-chrome-ink-soft font-bold shadow-lg" onclick={onSave}>保存</button>
  <button type="button" class="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 shadow-lg" onclick={onClear}>全てクリア</button>
  <span class="self-center text-sm text-green-600 font-medium transition-opacity duration-200" style:opacity={feedbackVisible ? 1 : 0}>{feedback}</span>
</div>

<ModalDialog bind:this={dialog} />
