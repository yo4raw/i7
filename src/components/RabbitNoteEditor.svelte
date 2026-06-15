<script lang="ts">
  import { CHARACTER_GROUPS } from '../lib/constants';
  import { loadRabbitNotes, saveRabbitNotes, type RabbitNoteMap } from '../lib/data/rabbitNote';

  const ATTRS = [
    { key: 'shout', label: 'Shout', color: 'text-red-600', border: 'focus:border-red-400' },
    { key: 'beat', label: 'Beat', color: 'text-green-600', border: 'focus:border-green-400' },
    { key: 'melody', label: 'Melody', color: 'text-blue-600', border: 'focus:border-blue-400' },
  ] as const;

  const GROUP_COLORS: Record<string, string> = {
    'IDOLiSH7': 'border-l-indigo-500',
    'TRIGGER': 'border-l-amber-500',
    'Re:vale': 'border-l-pink-500',
    'ŹOOĻ': 'border-l-emerald-500',
  };

  let data = $state<RabbitNoteMap>({});
  let feedback = $state('');
  let feedbackVisible = $state(false);

  $effect(() => {
    data = loadRabbitNotes();
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

  function onClear() {
    if (!confirm('全てのラビットノート値をクリアしますか？')) return;
    saveRabbitNotes({});
    data = {};
    showFeedback('クリアしました');
  }
</script>

<div>
  {#each CHARACTER_GROUPS as group}
    <section class="bg-white rounded-lg shadow mb-4 border-l-4 {GROUP_COLORS[group.name] || ''}">
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
  <button type="button" class="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold shadow-lg" onclick={onSave}>保存</button>
  <button type="button" class="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 shadow-lg" onclick={onClear}>全てクリア</button>
  <span class="self-center text-sm text-green-600 font-medium transition-opacity duration-300" style:opacity={feedbackVisible ? 1 : 0}>{feedback}</span>
</div>
