<script lang="ts">
  import { classifyEventStatus, eventStartMs, eventEndMs, formatDuration, type EventStatus } from '../lib/data/eventPeriod';

  type Props = {
    start_date: string;
    end_date: string;
  };

  let { start_date, end_date }: Props = $props();

  let now = $state(Date.now());

  const start = $derived(eventStartMs(start_date));
  const end = $derived(eventEndMs(end_date));
  const status: EventStatus = $derived(classifyEventStatus(start_date, end_date, now));

  $effect(() => {
    const interval = status === 'live' ? 1000 : 30000;
    const id = setInterval(() => { now = Date.now(); }, interval);
    return () => clearInterval(id);
  });

  const label = $derived(status === 'live' ? '実施中' : status === 'upcoming' ? '開催予定' : '終了');
  const badgeClass = $derived(
    status === 'live' ? 'text-white bg-red-600'
    : status === 'upcoming' ? 'text-blue-700 bg-blue-100'
    : 'text-gray-400 bg-gray-50'
  );

  const remainText: string = $derived.by(() => {
    // 終了未定の実施中イベントは残り時間を出せない
    if (status === 'live') return end === null ? '' : `残り ${formatDuration(end - now, 'second')}`;
    if (status === 'upcoming' && start !== null) return `開始まで ${formatDuration(start - now, 'minute')}`;
    return '';
  });
  const remainClass = $derived(status === 'live' ? 'text-red-600 font-medium' : 'text-gray-500');
</script>

<span class="inline-block px-2 py-0.5 rounded text-xs font-semibold {badgeClass}">{label}</span>
{#if remainText}
  <p class="text-sm mt-2 {remainClass}">{remainText}</p>
{/if}
