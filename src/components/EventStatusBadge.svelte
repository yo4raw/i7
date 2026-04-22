<script lang="ts">
  type Status = 'live' | 'upcoming' | 'past';

  type Props = {
    startIso: string;
    endIso: string;
  };

  let { startIso, endIso }: Props = $props();

  let now = $state(Date.now());

  const start = $derived(Date.parse(startIso));
  const end = $derived(Date.parse(endIso));

  const status: Status = $derived.by(() => {
    if (Number.isNaN(start) || Number.isNaN(end)) return 'past';
    if (now < start) return 'upcoming';
    if (now >= end) return 'past';
    return 'live';
  });

  $effect(() => {
    const interval = status === 'live' ? 1000 : 30000;
    const id = setInterval(() => { now = Date.now(); }, interval);
    return () => clearInterval(id);
  });

  function formatRemaining(ms: number): string {
    if (ms <= 0) return '';
    const t = Math.floor(ms / 1000);
    const d = Math.floor(t / 86400);
    const h = Math.floor((t % 86400) / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    if (d > 0) return `${d}日 ${h}時間 ${m}分 ${s}秒`;
    if (h > 0) return `${h}時間 ${m}分 ${s}秒`;
    if (m > 0) return `${m}分 ${s}秒`;
    return `${s}秒`;
  }

  function formatShort(ms: number): string {
    if (ms <= 0) return '';
    const t = Math.floor(ms / 1000);
    const d = Math.floor(t / 86400);
    const h = Math.floor((t % 86400) / 3600);
    const m = Math.floor((t % 3600) / 60);
    if (d > 0) return `${d}日 ${h}時間`;
    if (h > 0) return `${h}時間 ${m}分`;
    return `${m}分`;
  }

  const label = $derived(status === 'live' ? '実施中' : status === 'upcoming' ? '開催予定' : '終了');
  const badgeClass = $derived(
    status === 'live' ? 'text-white bg-red-600 animate-pulse'
    : status === 'upcoming' ? 'text-blue-700 bg-blue-100'
    : 'text-gray-400 bg-gray-50'
  );

  const remainText: string = $derived.by(() => {
    if (status === 'live') return `残り ${formatRemaining(end - now)}`;
    if (status === 'upcoming') return `開始まで ${formatShort(start - now)}`;
    return '';
  });
  const remainClass = $derived(status === 'live' ? 'text-red-600 font-medium' : 'text-gray-500');
</script>

<span class="inline-block px-2 py-0.5 rounded text-xs font-semibold {badgeClass}">{label}</span>
{#if remainText}
  <p class="text-sm mt-2 {remainClass}">{remainText}</p>
{/if}
